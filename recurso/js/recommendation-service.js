/* ================================================
   ai-recommendation-service.js
   Módulo de Integração com IA (Groq API) Padrão BYOK
   ================================================ */
window.AIRecommendationManager = (function() {
    'use strict';

    const STORAGE_KEY = 'juris_groq_api_key';
    const GROQ_MODEL = 'qwen/qwen3.6-27b'; 

    function _obterChaveAPI() {
        let key = localStorage.getItem(STORAGE_KEY);
        if (!key) {
            key = prompt('🔑 Integração IA: Insira sua API Key da Groq para habilitar a recomendação inteligente de modelos.\n\n(Ela será salva localmente no seu navegador).');
            if (key && key.trim().length > 10) {
                localStorage.setItem(STORAGE_KEY, key.trim());
            } else {
                return null;
            }
        }
        return key;
    }

    async function buscarModelosCompativeis(topicoId, textoAlegacoes) {
        if (!textoAlegacoes || textoAlegacoes.trim() === '') {
            if (window.exibirToast) exibirToast('Redija as Razões Recursais primeiro.', 'aviso');
            return;
        }

        if (typeof window.AcervoManager === 'undefined') {
            if (window.exibirToast) exibirToast('Módulo do Acervo não está carregado.', 'erro');
            return;
        }

        const apiKey = _obterChaveAPI();
        if (!apiKey) {
            if (window.exibirToast) exibirToast('Operação cancelada. Chave de API necessária.', 'aviso');
            return;
        }

        // 1. Snapshot do Catálogo Otimizado
        const modelos = await AcervoManager.carregarModelos();
        if (modelos.length === 0) {
            if (window.exibirToast) exibirToast('Seu acervo está vazio.', 'aviso');
            return;
        }

        const catalogoComprimido = modelos.map(m => {
            const tags = m.tags ? m.tags.join(", ") : "Geral";
            return `[Nome: ${m.nome} | Tags: ${tags}]`;
        }).join("\n");

        // 2. Feedback de Interface
        const btnIcon = document.querySelector('.preamble-alegacao .ai-trigger-btn');
        if (btnIcon) btnIcon.classList.add('is-thinking');
        if (window.exibirToast) exibirToast('IA processando afinidades...', 'info');

        try {
            const prompt = `Atue como um indexador jurídico.
OBJETIVO: Encontrar o modelo correspondente ao pedido abaixo.
PEDIDO (Razões): "${textoAlegacoes}"
CATÁLOGO DISPONÍVEL:
${catalogoComprimido}

REGRA ESTRITA: Responda APENAS com o NOME EXATO ou a TAG do modelo mais compatível listado no catálogo acima. Não inclua tags de pensamento, explicações, aspas ou pontos. Se nenhum for compatível, responda "NENHUM".`;

            // 3. Chamada de Rede Protegida
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1, // Quase determinístico
                    max_tokens: 50    // Aumentado levemente para permitir o bloco <think> caso o modelo force
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem(STORAGE_KEY);
                    throw new Error("Chave de API inválida ou expirada.");
                }
                throw new Error(`Erro na API: ${response.status}`);
            }

            const data = await response.json();
            
            // 4. Parse Seguro e Sanitização de Chain of Thought
            const respostaBruta = data?.choices?.[0]?.message?.content;
            if (!respostaBruta) throw new Error("A API retornou uma resposta vazia.");

            // Remove o bloco <think>...</think> (típico de DeepSeek/Qwen) e quebras de linha
            const respostaLimpa = respostaBruta.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\n/g, '').trim();

            const keywordIA = respostaLimpa.replace(/['".,]/g, '');

            if (keywordIA.toUpperCase() === "NENHUM" || keywordIA === "") {
                if (window.exibirToast) exibirToast('Nenhum modelo altamente compatível foi encontrado.', 'aviso');
                return;
            }

            console.log("[Juris IA] Afinidade detectada:", keywordIA);

            // 5. Orquestração da UI Nativa
            if (typeof abrirModalAcervo === 'function') abrirModalAcervo();
            
            const inputBusca = document.getElementById('input-pesquisa-acervo');
            if (inputBusca && typeof filtrarListaUIDebounced === 'function') {
                inputBusca.value = keywordIA;
                // Dispara o filtro nativo da aplicação
                filtrarListaUIDebounced(keywordIA, 'lista-acervo-geral');
            }
            
            if (window.exibirToast) exibirToast(`Filtro aplicado por IA: "${keywordIA}" ✨`, 'sucesso');

        } catch (error) {
            console.error("[Juris IA Error]", error);
            const msg = error.message === "Failed to fetch" ? "Erro de conexão (CORS/Rede)." : error.message;
            if (window.exibirToast) exibirToast(`Falha na IA: ${msg}`, 'erro');
        } finally {
            if (btnIcon) btnIcon.classList.remove('is-thinking');
        }
    }

    // Limpar chave manualmente, se necessário no futuro
    function resetarCredenciais() {
        localStorage.removeItem(STORAGE_KEY);
        if (window.exibirToast) exibirToast('Credenciais da IA resetadas.', 'sucesso');
    }

    return { buscarModelosCompativeis, resetarCredenciais };
})();