const requestRepo = require('../infrastructure/repositories/RequestRepository');
const ocrSvc      = require('../infrastructure/services/OcrService');
const pool        = require('../infrastructure/database/postgres');

// Ejecuta el pipeline de validación automática sobre una solicitud
class ValidationEngine {
  async run(request) {
    const results = [];
    const log = (step, status, detail, value) => {
      results.push({ step, status, detail, value });
      return requestRepo.logValidationStep(request.id, step, status, detail, value ? String(value) : null);
    };

    // PASO 1: Legibilidad del comprobante
    if (request.sin_factura) {
      await log('LEGIBILIDAD', 'SKIP', 'Sin factura — no requiere OCR');
    } else if (request.ocr_is_legible === false) {
      await log('LEGIBILIDAD', 'FAIL', 'Comprobante ilegible', request.ocr_confidence);
      return { passed: false, results };
    } else {
      await log('LEGIBILIDAD', 'PASS', 'Comprobante legible', request.ocr_confidence);
    }

    // PASO 2: Validación fiscal (CFDI 4.0)
    if (request.sin_factura) {
      await log('FISCAL', 'SKIP', 'Sin factura — omitido');
    } else {
      const hasCfdi = !!(request.ocr_rfc_emisor && request.ocr_uuid_cfdi);
      if (!hasCfdi) {
        await log('FISCAL', 'WARN', 'RFC o UUID no detectado en comprobante');
      } else {
        const ivaOk = request.ocr_iva != null && request.ocr_subtotal != null &&
          Math.abs(request.ocr_iva - request.ocr_subtotal * 0.16) < 0.1;
        if (!ivaOk) {
          await log('FISCAL', 'WARN', 'IVA no corresponde al 16% del subtotal', request.ocr_iva);
        } else {
          await log('FISCAL', 'PASS', `RFC: ${request.ocr_rfc_emisor} UUID: ${request.ocr_uuid_cfdi}`);
        }
      }
    }

    // PASO 3: Duplicados
    const dup = await requestRepo.checkDuplicate({
      sin_factura:  request.sin_factura,
      rfc_emisor:   request.ocr_rfc_emisor,
      uuid_cfdi:    request.ocr_uuid_cfdi,
      amount:       request.amount,
      requester_id: request.requester_id,
      project_id:   request.project_id,
      concept_id:   request.concept_id,
    });

    if (dup && dup.id !== request.id) {
      await log('DUPLICADO', 'WARN', `Posible duplicado: solicitud ${dup.id}`);
      await requestRepo.updateStatus(request.id, request.status, { possible_duplicate: true });
    } else {
      await log('DUPLICADO', 'PASS', 'Sin duplicado detectado');
    }

    // PASO 4: Período contable abierto
    const { rows: periods } = await pool.query(
      `SELECT * FROM accounting_periods
       WHERE year=$1 AND month=$2 AND project_id IS NULL AND status='ABIERTO'`,
      [request.period_year, request.period_month]
    );
    if (!periods.length) {
      await log('PERIODO', 'WARN', `Período ${request.period_year}-${request.period_month} cerrado o no existe`);
    } else {
      await log('PERIODO', 'PASS', `Período contable abierto`);
    }

    // PASO 5: Permiso de concepto por rol
    const requesterRole = request.requester_role || 'operative';
    const perm = await requestRepo.findConceptPermission(request.concept_id, requesterRole);
    if (!perm) {
      await log('CONCEPTO', 'FAIL', `Rol '${requesterRole}' sin permiso para este concepto`);
      return { passed: false, results };
    }
    await log('CONCEPTO', 'PASS', `Concepto permitido para rol ${requesterRole}`);

    // PASO 6: Límite de gasto
    const limit = await requestRepo.findSpendingLimit({
      concept_id: request.concept_id,
      role:       requesterRole,
      project_id: request.project_id,
    });

    if (limit && request.amount_mxn > limit.max_amount) {
      if (limit.action_on_exceed === 'block') {
        await log('LIMITE', 'FAIL', `Excede límite de $${limit.max_amount} MXN`, request.amount_mxn);
        await requestRepo.updateStatus(request.id, request.status, { exceeds_limit: true });
        return { passed: false, results };
      } else {
        await log('LIMITE', 'WARN', `Excede límite de $${limit.max_amount} MXN — escalará`, request.amount_mxn);
        await requestRepo.updateStatus(request.id, request.status, { exceeds_limit: true });
      }
    } else {
      await log('LIMITE', 'PASS', limit ? `Dentro del límite $${limit.max_amount}` : 'Sin límite configurado');
    }

    // PASO 7: Anomalía ML (simple rule-based por ahora)
    const anomaly = await this._detectAnomaly(request);
    if (anomaly) {
      await log('ANOMALIA_ML', 'WARN', anomaly);
      await requestRepo.updateStatus(request.id, request.status, { anomaly_ml: true });
    } else {
      await log('ANOMALIA_ML', 'PASS', 'Sin anomalía detectada');
    }

    const failed = results.filter(r => r.status === 'FAIL');
    return { passed: failed.length === 0, results };
  }

  async _detectAnomaly(request) {
    // Comparar con promedio histórico del solicitante en el mismo concepto
    const { rows } = await pool.query(
      `SELECT AVG(amount_mxn) AS avg_amount, STDDEV(amount_mxn) AS std_amount
       FROM spending_requests
       WHERE requester_id=$1 AND concept_id=$2
         AND status NOT IN ('RECHAZADO','CANCELADO')
         AND id!=$3`,
      [request.requester_id, request.concept_id, request.id]
    );

    const { avg_amount, std_amount } = rows[0];
    if (!avg_amount || !std_amount) return null;

    const avg = parseFloat(avg_amount);
    const std = parseFloat(std_amount);
    const val = parseFloat(request.amount_mxn || request.amount);

    // Alerta si supera 3 desviaciones estándar
    if (std > 0 && val > avg + 3 * std) {
      return `Monto $${val} inusualmente alto (promedio $${avg.toFixed(2)}, σ=$${std.toFixed(2)})`;
    }
    return null;
  }
}

module.exports = new ValidationEngine();
