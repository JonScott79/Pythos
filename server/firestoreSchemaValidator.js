/**
 * server/firestoreSchemaValidator.js
 *
 * Pythos Firestore Schema Validation & Security Safeguards (LOW-01)
 *
 * Enforces:
 * 1. Explicit schema validation and strict field allowlists for pythos_chats and learning_data documents.
 * 2. Type constraints, string lengths, array bounds, and document payload size limits (< 1MB).
 * 3. User ownership and document path validation (users/{uid}/...).
 * 4. Protection against unexpected fields, injection attempts, and oversized payloads.
 * 5. Consistent, structured validation errors to fail closed on malformed or unauthorized writes.
 */

const MAX_CHAT_DOC_BYTES = 1024 * 1024;      // 1 MB Firestore document limit
const MAX_LEARNING_DOC_BYTES = 256 * 1024;   // 256 KB safety bound
const MAX_CHAT_TITLE_LENGTH = 300;
const MAX_MESSAGES_COUNT = 500;
const MAX_MESSAGE_CONTENT_LENGTH = 100000;
const MAX_IMAGES_COUNT = 10;
const MAX_IMAGE_STRING_LENGTH = 10000;

const ALLOWED_CHAT_FIELDS = new Set([
  'id',
  'title',
  'timestamp',
  'updatedAt',
  'messages',
  'isTest',
  'testArtifact'
]);

const ALLOWED_MESSAGE_ROLES = new Set(['user', 'assistant', 'system']);

const ALLOWED_MESSAGE_FIELDS = new Set([
  'role',
  'content',
  'images',
  'isDeepThought',
  'dtLocale',
  'hasHistoricalImage',
  'simAttachment'
]);

const ALLOWED_LEARNING_RECORD_FIELDS = new Set([
  'id',
  'type',
  'topic',
  'problem_type',
  'original_error',
  'failure_mode',
  'corrected_result',
  'explanation',
  'verification_method',
  'confidence',
  'version',
  'created_at',
  'updated_at'
]);

const ALLOWED_LEARNING_CONFLICT_FIELDS = new Set([
  'id',
  'type',
  'existing_id',
  'candidate_data',
  'flagged_at',
  'status',
  'reason'
]);

/**
 * Validates document path ownership: ensures path matches users/{expectedUid}/{collection}/{docId}
 *
 * @param {string} path - Document path
 * @param {string} expectedUid - Expected authenticated user UID
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDocumentPathOwnership(path, expectedUid) {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'Document path must be a non-empty string.' };
  }
  if (!expectedUid || typeof expectedUid !== 'string') {
    return { valid: false, error: 'Authenticated student UID is required for path validation.' };
  }

  const normalized = path.replace(/^\/+|\/+$/g, '');
  const segments = normalized.split('/');

  if (segments.length < 3 || segments[0] !== 'users') {
    return { valid: false, error: `Invalid document path "${path}". Expected users/{uid}/{collection}/...` };
  }

  const pathUid = segments[1];
  if (pathUid !== expectedUid) {
    return {
      valid: false,
      error: `Unauthorized document path access: path owner "${pathUid}" does not match authenticated user "${expectedUid}".`
    };
  }

  return { valid: true };
}

/**
 * Validates a pythos_chats document.
 *
 * @param {Object} doc - Chat document payload
 * @param {Object} [options]
 * @param {string} [options.path] - Full document path for ownership check
 * @param {string} [options.uid] - Authenticated UID for ownership check
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateChatDocument(doc, options = {}) {
  const errors = [];

  if (options.path && options.uid) {
    const pathCheck = validateDocumentPathOwnership(options.path, options.uid);
    if (!pathCheck.valid) {
      errors.push(pathCheck.error);
    }
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push('Chat document must be a non-null object.');
    return { valid: false, errors };
  }

  // Check payload size
  let serialized;
  try {
    serialized = JSON.stringify(doc);
    const byteLength = Buffer.byteLength(serialized, 'utf8');
    if (byteLength > MAX_CHAT_DOC_BYTES) {
      errors.push(`Chat document payload size (${byteLength} bytes) exceeds maximum allowable limit of ${MAX_CHAT_DOC_BYTES} bytes.`);
    }
  } catch (err) {
    errors.push(`Chat document cannot be serialized to JSON: ${err.message}`);
    return { valid: false, errors };
  }

  // Check field allowlist
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_CHAT_FIELDS.has(key)) {
      errors.push(`Unexpected field "${key}" is not permitted in pythos_chats documents.`);
    }
  }

  // Check required fields
  if (typeof doc.title !== 'string') {
    errors.push('Chat document "title" is required and must be a string.');
  } else if (doc.title.trim().length === 0) {
    errors.push('Chat document "title" cannot be empty.');
  } else if (doc.title.length > MAX_CHAT_TITLE_LENGTH) {
    errors.push(`Chat document "title" length (${doc.title.length}) exceeds maximum allowable length of ${MAX_CHAT_TITLE_LENGTH} characters.`);
  }

  if (!Array.isArray(doc.messages)) {
    errors.push('Chat document "messages" is required and must be an array.');
  } else {
    if (doc.messages.length > MAX_MESSAGES_COUNT) {
      errors.push(`Chat document "messages" array length (${doc.messages.length}) exceeds maximum limit of ${MAX_MESSAGES_COUNT} messages.`);
    }

    doc.messages.forEach((msg, idx) => {
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
        errors.push(`Message at index ${idx} must be a non-null object.`);
        return;
      }

      // Check message fields
      for (const mKey of Object.keys(msg)) {
        if (!ALLOWED_MESSAGE_FIELDS.has(mKey)) {
          errors.push(`Message at index ${idx} contains unexpected field "${mKey}".`);
        }
      }

      // Role check
      if (!msg.role || !ALLOWED_MESSAGE_ROLES.has(msg.role)) {
        errors.push(`Message at index ${idx} has invalid role "${msg.role}". Allowed roles: ${Array.from(ALLOWED_MESSAGE_ROLES).join(', ')}.`);
      }

      // Content check
      if (typeof msg.content !== 'string') {
        errors.push(`Message at index ${idx} "content" must be a string.`);
      } else if (msg.content.length > MAX_MESSAGE_CONTENT_LENGTH) {
        errors.push(`Message at index ${idx} "content" length (${msg.content.length}) exceeds maximum limit of ${MAX_MESSAGE_CONTENT_LENGTH} characters.`);
      }

      // Optional images check
      if (msg.images !== undefined) {
        if (!Array.isArray(msg.images)) {
          errors.push(`Message at index ${idx} "images" must be an array of strings.`);
        } else {
          if (msg.images.length > MAX_IMAGES_COUNT) {
            errors.push(`Message at index ${idx} "images" count (${msg.images.length}) exceeds maximum limit of ${MAX_IMAGES_COUNT}.`);
          }
          msg.images.forEach((img, imgIdx) => {
            if (typeof img !== 'string') {
              errors.push(`Message at index ${idx} image at ${imgIdx} must be a string.`);
            } else if (img.length > MAX_IMAGE_STRING_LENGTH) {
              errors.push(`Message at index ${idx} image at ${imgIdx} exceeds maximum string length of ${MAX_IMAGE_STRING_LENGTH} characters.`);
            }
          });
        }
      }

      // Optional flags
      if (msg.isDeepThought !== undefined && typeof msg.isDeepThought !== 'boolean') {
        errors.push(`Message at index ${idx} "isDeepThought" must be a boolean.`);
      }
      if (msg.dtLocale !== undefined && (typeof msg.dtLocale !== 'string' || msg.dtLocale.length > 10)) {
        errors.push(`Message at index ${idx} "dtLocale" must be a string of at most 10 characters.`);
      }
    });
  }

  // Optional top-level fields
  if (doc.isTest !== undefined && typeof doc.isTest !== 'boolean') {
    errors.push('Chat document "isTest" must be a boolean.');
  }
  if (doc.testArtifact !== undefined && typeof doc.testArtifact !== 'boolean') {
    errors.push('Chat document "testArtifact" must be a boolean.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates a learning_data (pythos_learning) document.
 *
 * @param {Object} doc - Learning document payload
 * @param {Object} [options]
 * @param {string} [options.path] - Full document path for ownership check
 * @param {string} [options.uid] - Authenticated UID for ownership check
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateLearningDocument(doc, options = {}) {
  const errors = [];

  if (options.path && options.uid) {
    const pathCheck = validateDocumentPathOwnership(options.path, options.uid);
    if (!pathCheck.valid) {
      errors.push(pathCheck.error);
    }
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push('Learning document must be a non-null object.');
    return { valid: false, errors };
  }

  // Check payload size
  let serialized;
  try {
    serialized = JSON.stringify(doc);
    const byteLength = Buffer.byteLength(serialized, 'utf8');
    if (byteLength > MAX_LEARNING_DOC_BYTES) {
      errors.push(`Learning document payload size (${byteLength} bytes) exceeds maximum allowable limit of ${MAX_LEARNING_DOC_BYTES} bytes.`);
    }
  } catch (err) {
    errors.push(`Learning document cannot be serialized to JSON: ${err.message}`);
    return { valid: false, errors };
  }

  const type = doc.type || 'record';

  if (type === 'record') {
    // Check allowlist
    for (const key of Object.keys(doc)) {
      if (!ALLOWED_LEARNING_RECORD_FIELDS.has(key)) {
        errors.push(`Unexpected field "${key}" is not permitted in learning record documents.`);
      }
    }

    // Check required fields
    if (typeof doc.topic !== 'string' || doc.topic.trim().length === 0) {
      errors.push('Learning record "topic" is required and must be a non-empty string.');
    } else if (doc.topic.length > 200) {
      errors.push(`Learning record "topic" exceeds 200 characters.`);
    }

    if (typeof doc.problem_type !== 'string' || doc.problem_type.trim().length === 0) {
      errors.push('Learning record "problem_type" is required and must be a non-empty string.');
    } else if (doc.problem_type.length > 200) {
      errors.push(`Learning record "problem_type" exceeds 200 characters.`);
    }

    if (typeof doc.corrected_result !== 'string' || doc.corrected_result.trim().length === 0) {
      errors.push('Learning record "corrected_result" is required and must be a non-empty string.');
    } else if (doc.corrected_result.length > 1000) {
      errors.push(`Learning record "corrected_result" exceeds 1000 characters.`);
    }

    if (doc.explanation !== undefined) {
      if (typeof doc.explanation !== 'string') {
        errors.push('Learning record "explanation" must be a string.');
      } else if (doc.explanation.length > 5000) {
        errors.push(`Learning record "explanation" exceeds 5000 characters.`);
      }
    }

    if (doc.verification_method !== undefined && typeof doc.verification_method !== 'string') {
      errors.push('Learning record "verification_method" must be a string.');
    }

    if (doc.confidence !== undefined && typeof doc.confidence !== 'string') {
      errors.push('Learning record "confidence" must be a string.');
    }

    if (doc.version !== undefined && (!Number.isInteger(doc.version) || doc.version < 1)) {
      errors.push('Learning record "version" must be an integer >= 1.');
    }
  } else if (type === 'conflict') {
    // Check allowlist
    for (const key of Object.keys(doc)) {
      if (!ALLOWED_LEARNING_CONFLICT_FIELDS.has(key)) {
        errors.push(`Unexpected field "${key}" is not permitted in learning conflict documents.`);
      }
    }

    if (typeof doc.existing_id !== 'string' || doc.existing_id.trim().length === 0) {
      errors.push('Learning conflict "existing_id" is required and must be a non-empty string.');
    }

    if (!doc.candidate_data || typeof doc.candidate_data !== 'object' || Array.isArray(doc.candidate_data)) {
      errors.push('Learning conflict "candidate_data" is required and must be a non-null object.');
    }

    if (doc.reason !== undefined && (typeof doc.reason !== 'string' || doc.reason.length > 2000)) {
      errors.push('Learning conflict "reason" must be a string of at most 2000 characters.');
    }
  } else {
    errors.push(`Invalid learning document type "${type}". Allowed types: "record", "conflict".`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateDocumentPathOwnership,
  validateChatDocument,
  validateLearningDocument,
  MAX_CHAT_DOC_BYTES,
  MAX_LEARNING_DOC_BYTES,
  MAX_CHAT_TITLE_LENGTH,
  MAX_MESSAGES_COUNT,
  MAX_MESSAGE_CONTENT_LENGTH,
  ALLOWED_CHAT_FIELDS,
  ALLOWED_LEARNING_RECORD_FIELDS,
  ALLOWED_LEARNING_CONFLICT_FIELDS
};
