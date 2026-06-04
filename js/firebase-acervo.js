import { app, auth } from './firebase-auth.js'; 
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, arrayUnion, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore(app);

window.AcervoManager = (function() {
    let modelosEmCache = [];

    function getUserId() {
        return auth.currentUser ? auth.currentUser.uid : null;
    }

    // HELPER 1: Geração de ID seguro e resiliente (Fallback para HTTP local)
    function _gerarIdSeguro(prefixo = 'mod-') {
        try {
            return prefixo + crypto.randomUUID();
        } catch (e) {
            console.warn("[AcervoManager] API Web Crypto indisponível. Usando fallback matemático.");
            return prefixo + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
        }
    }

    // HELPER 2: Dicionário de Erros Isolado (Evita string matching na UI)
    function _processarErroFirebase(erro, contexto) {
        console.error(`[AcervoManager] Falha em: ${contexto}`, erro);
        
        let msgUsuario = "Ocorreu um erro desconhecido ao comunicar com a nuvem.";
        
        // Mapeamento estrito baseado em código imutável do Firebase
        switch (erro.code) {
            case 'permission-denied':
                msgUsuario = "Acesso negado. Verifique as regras de segurança do banco de dados.";
                break;
            case 'unavailable':
            case 'network-request-failed':
                msgUsuario = "Sem conexão com a internet. Verifique sua rede e tente novamente.";
                break;
            case 'unauthenticated':
                msgUsuario = "Sua sessão expirou. Por favor, atualize a página e faça login novamente.";
                break;
        }

        // Lança um erro customizado que o app.js consiga ler de forma padronizada
        const erroTratado = new Error(msgUsuario);
        erroTratado.isCustom = true;
        throw erroTratado;
    }

    async function salvarNovoModelo(nome, noOriginal) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado. Faça login.");

        const modeloId = _gerarIdSeguro();
        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        
        const noLimpo = { intencao: noOriginal.intencao || 'premissa', texto: noOriginal.texto || '', timestamp: Date.now() };

        try {
            await setDoc(docRef, { nome: nome, criadoEm: Date.now(), nos: [noLimpo] });
            modelosEmCache = []; 
            return modeloId;
        } catch (e) {
            _processarErroFirebase(e, 'salvarNovoModelo (setDoc)');
        }
    }

    async function adicionarNoAModelo(modeloId, noOriginal) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado. Faça login.");

        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        const noLimpo = { intencao: noOriginal.intencao || 'premissa', texto: noOriginal.texto || '', timestamp: Date.now() };

        try {
            await updateDoc(docRef, { nos: arrayUnion(noLimpo), atualizadoEm: Date.now() });
            modelosEmCache = []; 
        } catch (e) {
             _processarErroFirebase(e, 'adicionarNoAModelo (updateDoc)');
        }
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
