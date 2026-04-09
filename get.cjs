const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAGiJrWnwbdY4PrI-YHMf7DWOS9wFlsY3c",
  authDomain: "print-shop-os-f8092.firebaseapp.com",
  projectId: "print-shop-os-f8092",
  storageBucket: "print-shop-os-f8092.firebasestorage.app",
  messagingSenderId: "637868552650",
  appId: "1:637868552650:web:473f9f71ad41703ec7df33",
  measurementId: "G-SJQD5JWQJG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

getDoc(doc(db, 'orders', 'order-1775685013551')).then(d => {
  console.log(JSON.stringify(d.data(), null, 2));
  process.exit(0);
}).catch(console.error);
