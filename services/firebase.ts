import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Config provided by user
const firebaseConfig = {
  apiKey: "AIzaSyAvwK33uc_vqnZ1tQgbkjtjQfpj82pbFNQ",
  authDomain: "gpick-cloud.firebaseapp.com",
  projectId: "gpick-cloud",
  storageBucket: "gpick-cloud.firebasestorage.app",
  messagingSenderId: "555183514474",
  appId: "1:555183514474:web:c7b946d8dfd337d4453b13",
  measurementId: "G-SMNY283ETK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);