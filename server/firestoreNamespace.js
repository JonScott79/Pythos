/**
 * server/firestoreNamespace.js
 *
 * Centralized Firestore namespace resolver for Pythos.
 * Ensures staging (`PYTHOS_ENV=staging`) reads, writes, updates, deletes,
 * and background tasks are strictly isolated from production collections,
 * while failing closed on invalid PYTHOS_ENV values.
 */

const ALLOWED_ENVS = new Set(['', 'production', 'staging', 'test', 'development']);

function getNormalizedPythosEnv() {
  const raw = process.env.PYTHOS_ENV === undefined ? '' : String(process.env.PYTHOS_ENV).trim().toLowerCase();
  if (!ALLOWED_ENVS.has(raw)) {
    throw new Error(`[FIRESTORE NAMESPACE] Invalid PYTHOS_ENV="${process.env.PYTHOS_ENV}". Refusing to resolve Firestore namespace.`);
  }
  return raw;
}

function isStagingEnvironment() {
  return getNormalizedPythosEnv() === 'staging';
}

function getAnchorDocName() {
  return isStagingEnvironment() ? 'app_staging' : 'app';
}

function getMemoryCollectionName() {
  return isStagingEnvironment() ? 'pythos_memory_staging' : 'pythos_memory';
}

function getLearningCollectionName() {
  return isStagingEnvironment() ? 'pythos_learning_staging' : 'pythos_learning';
}

function getChatsCollectionName() {
  return isStagingEnvironment() ? 'pythos_chats_staging' : 'pythos_chats';
}

function resolveFirestoreNamespaces() {
  const env = getNormalizedPythosEnv();
  return {
    env: env || 'production_default',
    isStaging: env === 'staging',
    pythosCollection: 'pythos',
    anchorDoc: getAnchorDocName(),
    memoryCollection: getMemoryCollectionName(),
    learningCollection: getLearningCollectionName(),
    chatsCollection: getChatsCollectionName()
  };
}

module.exports = {
  getNormalizedPythosEnv,
  isStagingEnvironment,
  getAnchorDocName,
  getMemoryCollectionName,
  getLearningCollectionName,
  getChatsCollectionName,
  resolveFirestoreNamespaces
};
