const path = require('path');
// Resolve node_modules from server/node_modules
module.paths.push(path.resolve(__dirname, '../server/node_modules'));

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const fs = require('fs');
const defaultCredPath = 'C:/Projects/lanzar/firebase-credentials/lanzar-95ae3-firebase-adminsdk-fbsvc-86e8ea5817.json';
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else if (fs.existsSync(defaultCredPath)) {
  serviceAccount = require(defaultCredPath);
} else {
  throw new Error('No Firebase service account credentials found in process.env or at ' + defaultCredPath);
}

const app = initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
const db = getFirestore(app);
const auth = getAuth(app);

async function grantAdmin() {
  console.log('======================================================================');
  console.log('🔐 LANZAR ECOSYSTEM — UNIFIED ADMIN ENTITLEMENT PROVISIONING');
  console.log('======================================================================\n');

  console.log('--- 1. Provisioning jonny.scott79@gmail.com ---');
  const googleUid = 'Tcdyrq9vIVhfPeeDPnTrZIP553x1';
  
  // Custom Claims
  await auth.setCustomUserClaims(googleUid, { admin: true, role: 'admin' });
  console.log('  ✓ Set Firebase Auth custom claims { admin: true, role: "admin" } on UID:', googleUid);

  // Firestore /admins/{googleUid}
  await db.collection('admins').doc(googleUid).set({
    email: 'jonny.scott79@gmail.com',
    alternateEmail: 'jon@lanzar.me',
    displayName: 'Jon Scott',
    active: true,
    role: 'ADMIN',
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('  ✓ Updated /admins/' + googleUid + ' (active: true, role: ADMIN)');

  // Firestore /users/{googleUid}
  await db.collection('users').doc(googleUid).set({
    role: 'ADMIN',
    active: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('  ✓ Updated /users/' + googleUid + ' (role: ADMIN, active: true)');

  // Email alias doc in /admins/
  await db.collection('admins').doc('jonny.scott79@gmail.com').set({
    active: true,
    role: 'ADMIN',
    email: 'jonny.scott79@gmail.com',
    uid: googleUid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('  ✓ Set /admins/jonny.scott79@gmail.com email-keyed alias');

  console.log('\n--- 2. Provisioning jon@lanzar.me ---');
  let jonAuthUser;
  try {
    jonAuthUser = await auth.getUserByEmail('jon@lanzar.me');
    console.log('  • Found existing Firebase Auth user for jon@lanzar.me:', jonAuthUser.uid);
  } catch (err) {
    console.log('  • Creating Firebase Auth user for jon@lanzar.me...');
    jonAuthUser = await auth.createUser({
      email: 'jon@lanzar.me',
      displayName: 'Jon Scott',
      emailVerified: true
    });
    console.log('  ✓ Created Firebase Auth user for jon@lanzar.me with UID:', jonAuthUser.uid);
  }

  // Set Custom Claims on jonAuthUser
  await auth.setCustomUserClaims(jonAuthUser.uid, { admin: true, role: 'admin' });
  console.log('  ✓ Set Firebase Auth custom claims { admin: true, role: "admin" } on UID:', jonAuthUser.uid);

  // Firestore /admins/{jonAuthUser.uid}
  await db.collection('admins').doc(jonAuthUser.uid).set({
    email: 'jon@lanzar.me',
    displayName: 'Jon Scott',
    active: true,
    role: 'ADMIN',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('  ✓ Set /admins/' + jonAuthUser.uid + ' (active: true, role: ADMIN)');

  // Firestore /users/{jonAuthUser.uid}
  await db.collection('users').doc(jonAuthUser.uid).set({
    email: 'jon@lanzar.me',
    displayName: 'Jon Scott',
    role: 'ADMIN',
    active: true,
    services: ['it', 'web', 'threadline', 'network', 'server', 'pythos'],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('  ✓ Set /users/' + jonAuthUser.uid + ' (role: ADMIN, active: true)');

  // LANZAR ID UID: lanzar_1f8e051ddac67b628741
  const lanzarUid = 'lanzar_1f8e051ddac67b628741';
  await db.collection('admins').doc(lanzarUid).set({
    email: 'jon@lanzar.me',
    displayName: 'Jon Scott',
    active: true,
    role: 'ADMIN',
    firebaseUid: jonAuthUser.uid,
    googleUid: googleUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('  ✓ Set /admins/' + lanzarUid + ' for LANZAR ID profile (active: true, role: ADMIN)');

  // Update LANZAR ID Account document in pythos/app/lanzar_id_accounts
  await db.collection('pythos').doc('app').collection('lanzar_id_accounts').doc(lanzarUid).set({
    role: 'ADMIN',
    isAdmin: true,
    linkedGoogleUid: googleUid,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log('  ✓ Updated pythos/app/lanzar_id_accounts/' + lanzarUid + ' (role: ADMIN, isAdmin: true)');

  // Email alias doc in /admins/
  await db.collection('admins').doc('jon@lanzar.me').set({
    active: true,
    role: 'ADMIN',
    email: 'jon@lanzar.me',
    uid: jonAuthUser.uid,
    lanzarUid: lanzarUid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('  ✓ Set /admins/jon@lanzar.me email-keyed alias');

  console.log('\n======================================================================');
  console.log('✅ ALL ADMIN ENTITLEMENTS PROVISIONED ACROSS FIREBASE AUTH & FIRESTORE');
  console.log('======================================================================\n');
}

grantAdmin().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
