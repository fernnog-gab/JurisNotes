import { app, auth } from './firebase-auth.js'; 
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, arrayUnion, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore(app);

window.AcervoManager = (function() {
    let modelosEmCache = [];

    function getUserId() {
        return auth.currentUser ? auth.currentUser.uid : null;
    }

    async function salvarNovoModelo(nome, noOriginal) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");

        const modeloId = 'mod-' + crypto.randomUUID();
        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        
        const noLimpo = { intencao: noOriginal.intencao || 'premissa', texto: noOriginal.texto || '', timestamp: Date.now() };

        await setDoc(docRef, { nome: nome, criadoEm: Date.now(), nos: [noLimpo] });
        modelosEmCache = []; 
        return modeloId;
    }

    async function adicionarNoAModelo(modeloId, noOriginal) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");

        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        const noLimpo = { intencao: noOriginal.intencao || 'premissa', texto: noOriginal.texto || '', timestamp: Date.now() };

        await updateDoc(docRef, { nos: arrayUnion(noLimpo), atualizadoEm: Date.now() });
        modelosEmCache = []; 
    }

    async function carregarModelos() {
        const uid = getUserId();
        if (!uid) return [];
        if (modelosEmCache.length > 0) return modelosEmCache;

        const q = query(collection(db, "usuarios", uid, "acervo"), orderBy("nome", "asc"));
        const querySnapshot = await getDocs(q);
        
        const modelos = [];
        querySnapshot.forEach((docSnap) => {
            // Usa docSnap.id como chave primária real (Correção de Bug do Relatório)
            modelos.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        modelosEmCache = modelos;
        return modelos;
    }

    return { salvarNovoModelo, adicionarNoAModelo, carregarModelos };
})();
