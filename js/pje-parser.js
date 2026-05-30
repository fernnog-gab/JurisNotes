/* ================================================
   pje-parser.js
   Módulo de Inteligência para Leitura do Sumário PJe
   Arquitetura Refatorada: Resiliência Vetorial (Web Worker)
   ================================================ */
window.PjeParser = (function () {
    'use strict';

    function mapearAtalhosWorker(buffer) {
        return new Promise((resolve) => {
            const worker = new Worker('js/workers/pje-worker.js');
            
            worker.onmessage = (e) => {
                if (e.data.success) {
                    resolve(e.data.atalhos);
                } else {
                    console.warn('[PjeParser Worker] Operação abortada:', e.data.error);
                    resolve({ contestacao: null, contestacaoRe2: null, sentenca: null });
                }
                // Limpeza crítica de RAM: mata a thread e os clones do buffer criados.
                worker.terminate(); 
            };

            worker.onerror = (err) => {
                console.warn('[PjeParser Worker] Exceção na Thread:', err);
                resolve({ contestacao: null, contestacaoRe2: null, sentenca: null });
                worker.terminate(); 
            };

            // Dispara o algoritmo de Structured Clone internamente. 
            // O navegador duplicará o buffer. O GC limpará assim que worker.terminate() rodar.
            worker.postMessage({ buffer: buffer });
        });
    }

    return { mapearAtalhos: mapearAtalhosWorker };
})();
