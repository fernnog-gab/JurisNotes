/* ================================================
   ed_recommendation-service.js (Módulo Embargos)
   Orquestra a chamada de IA para mapear o Acervo
   ================================================ */

window.AIRecommendationManager = (function() {
    const STORAGE_KEY = 'juris_notes_groq_api_key';
    const GROQ_MODEL = "qwen-2.5-32b"; // Modelo rápido padrão

    function _obterChaveAPI() {
        const key = localStorage.getItem(STORAGE_KEY);
        if (!key) {
            const novaKey = prompt("Autenticação IA (Groq API):\n\nInsira sua chave de API fornecida pela Groq para ativar os superpoderes de classificação e IA do sistema:");
            if (novaKey && novaKey.trim() !== '') {
                localStorage.setItem(STORAGE_KEY, novaKey.trim());
                return novaKey.trim();
            }
            return null;
        }
        return key;
    }

    async function buscarModelosCompativeis(topicoId, textoVicio) {
        if (!textoVicio || textoVicio.trim() === '') return window.exibirToast?.('Redija o Vício Alegado primeiro.', 'aviso');
        
        const apiKey = _obterChaveAPI();
        if (!apiKey) return;

        if (typeof window.AcervoManager === 'undefined') return window.exibirToast?.('Módulo do Acervo não está carregado.', 'erro');

        const modelos = await AcervoManager.carregarModelos();
        if (modelos.length === 0) return window.exibirToast?.('Seu acervo está vazio.', 'aviso');

        // PAYLOAD OTIMIZADO: Apenas ID e Título
        const catalogoComprimido = modelos.map(m => `ID: ${m.id} | Título: ${m.nome}`).join("\n");

        const btnIcon = document.querySelector('.preamble-alegacao .ai-trigger-btn');
        if (btnIcon) btnIcon.classList.add('is-thinking');
        if (window.exibirToast) exibirToast('IA analisando afinidades no Acervo...', 'info');

        try {
            const prompt = `Atue como um indexador jurídico. Analise a tese de Embargos de Declaração e encontre os modelos compatíveis.
VÍCIO ALEGADO: "${textoVicio}"

ACERVO DE MODELOS:
${catalogoComprimido}

REGRA ESTABELECIDA:
Se houver modelos compatíveis, responda OBRIGATORIAMENTE no formato exato: [IDs: mod-xxx, mod-yyy]
Se NÃO houver NENHUM modelo compatível com o tema, responda OBRIGATORIAMENTE: [IDs: NENHUM]`;

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: GROQ_MODEL, 
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    max_tokens: 800 // Evita truncamento do chain-of-thought
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem(STORAGE_KEY);
                    throw new Error("Chave de API inválida ou expirada.");
                }
                throw new Error("Falha na API da IA.");
            }

            const data = await response.json();
            const respostaBruta = data?.choices?.[0]?.message?.content || "";

            // EXTRAÇÃO BLINDADA: Busca por "NENHUM"
            if (respostaBruta.includes("NENHUM")) {
                if (window.exibirToast) exibirToast('Nenhum modelo de alta afinidade encontrado.', 'aviso');
                return; 
            }

            // EXTRAÇÃO BLINDADA: Match via Regex com IDs aceitando underlines
            const idsExtraidos = respostaBruta.match(/mod-[a-zA-Z0-9_-]+/g);

            if (!idsExtraidos || idsExtraidos.length === 0) {
                if (window.exibirToast) exibirToast('Nenhum modelo foi classificado como compatível.', 'aviso');
                return;
            }

            console.log("[Juris IA - ED] Recomendações:", idsExtraidos);

            // Interface ED nativa
            if (typeof aplicarFiltroIAAcervo === 'function') {
                aplicarFiltroIAAcervo(idsExtraidos);
                if (window.exibirToast) exibirToast('Filtro de Inteligência Artificial aplicado ✨', 'sucesso');
            }

        } catch (error) {
            console.error("[Juris IA Error - ED]", error);
            if (window.exibirToast) exibirToast('Falha na comunicação com a Inteligência Artificial.', 'erro');
        } finally {
            if (btnIcon) btnIcon.classList.remove('is-thinking');
        }
    }

    return { buscarModelosCompativeis };
})();