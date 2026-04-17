/**
 * Field-level encryption helpers.
 *
 * This module deliberately isolates the current direct-KMS spike from the
 * application routes. That keeps the route code readable now, and gives us
 * a clean seam to replace later with envelope encryption.
 */

import { decryptWithGoogleKms, encryptWithGoogleKms, isGoogleKmsConfigured } from './google-kms.js';

export const APPLICATION_PHONE_ENCRYPTION_SCHEME = 'gcp_kms_direct_v1';

function buildApplicationPhoneAad({ tenantId, applicationId }) {
  return JSON.stringify({
    scope: 'applications.applicant_phone',
    tenant_id: tenantId,
    application_id: applicationId,
  });
}

export async function encryptApplicationApplicantPhone(phone, context, env) {
  const normalisedPhone = typeof phone === 'string' ? phone.trim() : null;
  if (!normalisedPhone) {
    return {
      ciphertext: null,
      kmsKeyName: null,
      kmsKeyVersion: null,
      encryptionScheme: null,
    };
  }

  if (!isGoogleKmsConfigured(env)) {
    return {
      ciphertext: normalisedPhone,
      kmsKeyName: null,
      kmsKeyVersion: null,
      encryptionScheme: null,
    };
  }

  const encrypted = await encryptWithGoogleKms(
    env,
    normalisedPhone,
    buildApplicationPhoneAad(context)
  );

  return {
    ciphertext: encrypted.ciphertext,
    kmsKeyName: encrypted.keyName,
    kmsKeyVersion: encrypted.keyVersion,
    encryptionScheme: APPLICATION_PHONE_ENCRYPTION_SCHEME,
  };
}

export async function decryptApplicationApplicantPhone(row, env) {
  if (!row.applicant_phone) return null;

  // Backward compatibility for existing dev rows created before the spike.
  // Rows without the marker remain readable until they are re-saved.
  if (row.applicant_phone_encryption_scheme !== APPLICATION_PHONE_ENCRYPTION_SCHEME) {
    return row.applicant_phone;
  }

  if (!row.applicant_phone_kms_key_name) {
    throw new Error('Encrypted applicant phone is missing applicant_phone_kms_key_name');
  }

  return decryptWithGoogleKms(
    env,
    row.applicant_phone_kms_key_name,
    row.applicant_phone,
    buildApplicationPhoneAad({
      tenantId: row.tenant_id,
      applicationId: row.id,
    })
  );
}

export async function serialiseApplicationForResponse(row, env) {
  const {
    applicant_phone_kms_key_name: _kmsKeyName,
    applicant_phone_kms_key_version: _kmsKeyVersion,
    applicant_phone_encryption_scheme: _encryptionScheme,
    ...publicRow
  } = row;

  return {
    ...publicRow,
    applicant_phone: await decryptApplicationApplicantPhone(row, env),
  };
}
