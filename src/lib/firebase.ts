import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAGiJrWnwbdY4PrI-YHMf7DWOS9wFlsY3c",
  authDomain: "print-shop-os-f8092.firebaseapp.com",
  projectId: "print-shop-os-f8092",
  storageBucket: "print-shop-os-f8092.firebasestorage.app",
  messagingSenderId: "637868552650",
  appId: "1:637868552650:web:473f9f71ad41703ec7df33",
  measurementId: "G-SJQD5JWQJG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Keep analytics optional for browser-only execution
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Initialize Core Firebase Services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
