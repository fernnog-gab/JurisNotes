// 1. Usa versão minificada legada (CJS/UMD) compatível com importScripts
importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.js');

// 2. Configuração Arquitetural Crítica:
// Como JÁ ESTAMOS em um Web Worker, proibimos o PDF.js de tentar criar um Sub-Worker
// Isso evita crashes no Chrome/Edge e falhas de CORS no carregamento dinâmico.
pdfjsLib.GlobalWorkerOptions.disableWorker = true;

const normalizeString = (str) => {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
};

self.onmessage = async function(e) {
    // arrayBuffer copiado pela Main Thread via Structured Clone
    const { buffer } = e.data; 
    let atalhos = { contestacao: null, contestacaoRe2: null, sentenca: null };
    let contestacoesEncontradas = [];

    try {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        const pdfDoc = await loadingTask.promise;
        const maxPaginasScan = Math.min(40, pdfDoc.numPages);
        let reachedSummaryStart = false;

        for (let i = pdfDoc.numPages; i > pdfDoc.numPages - maxPaginasScan; i--) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const fullTextNormal = normalizeString(textContent.items.map(t => t.str).join(' '));

            if (!fullTextNormal.includes('DOCUMENTO') && !fullTextNormal.includes('TIPO') && !fullTextNormal.includes('SUMARIO')) {
                if (reachedSummaryStart) break; 
                continue; 
            }
            if (fullTextNormal.includes('SUMARIO')) reachedSummaryStart = true;

            const annotations = await page.getAnnotations();
            const linkAnns = annotations.filter(a => a.subtype === 'Link' && a.dest);

            const linhas = {};
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5]); 
                const height = Math.abs(item.transform[3]);
                if (!linhas[y]) linhas[y] = { texto: '', alturaReferencia: height };
                linhas[y].texto += item.str + ' ';
                linhas[y].alturaReferencia = Math.max(linhas[y].alturaReferencia, height);
            });

            for (const [yStr, dadosLinha] of Object.entries(linhas)) {
                const y = parseInt(yStr);
                const textoLinha = normalizeString(dadosLinha.texto);
                let alvoEncontrado = null;

                if (textoLinha.includes('CONTESTACAO')) alvoEncontrado = 'contestacao';
                else if (textoLinha.includes('SENTENCA') || textoLinha.includes('ACORDAO')) alvoEncontrado = 'sentenca';

                if (alvoEncontrado) {
                    const tolerancia = dadosLinha.alturaReferencia * 0.75;
                    const link = linkAnns.find(a => {
                        const [, ly, , uy] = a.rect; 
                        return y >= Math.min(ly, uy) - tolerancia && y <= Math.max(ly, uy) + tolerancia;
                    });

                    if (link) {
                        let destino = link.dest;
                        if (typeof destino === 'string') destino = await pdfDoc.getDestination(destino);
                        
                        if (Array.isArray(destino)) {
                            const pageRef = destino[0];
                            let numPaginaTarget = null;
                            if (typeof pageRef === 'object' && pageRef !== null) {
                                numPaginaTarget = (await pdfDoc.getPageIndex(pageRef)) + 1;
                            } else if (Number.isInteger(pageRef)) {
                                numPaginaTarget = pageRef + 1;
                            }
                            
                            if (numPaginaTarget) {
                                if (alvoEncontrado === 'sentenca' && !atalhos.sentenca) atalhos.sentenca = numPaginaTarget;
                                else if (alvoEncontrado === 'contestacao' && !contestacoesEncontradas.includes(numPaginaTarget)) {
                                    contestacoesEncontradas.push(numPaginaTarget);
                                }
                            }
                        }
                    }
                }
            }
            if (contestacoesEncontradas.length >= 2 && atalhos.sentenca) break;
            if (reachedSummaryStart) break;
        }

        contestacoesEncontradas.sort((a, b) => a - b);
        if (contestacoesEncontradas.length > 0) atalhos.contestacao = contestacoesEncontradas[0];
        if (contestacoesEncontradas.length > 1) atalhos.contestacaoRe2 = contestacoesEncontradas[1];

        // 3. Devolve os dados serializáveis e encerra a promessa de trabalho
        self.postMessage({ success: true, atalhos });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};
