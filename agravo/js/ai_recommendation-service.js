/* ================================================
   ai_recommendation-service.js
   Serviço de Inteligência Artificial e LLM para o Acervo
   ================================================ */

window.AIRecommendationManager = (function () {
    'use strict';

    const GROQ_MODEL = "qwen-2.5-32b";

    function _obterChaveAPI() {
        const STORAGE_KEY = 'juris_api_key_groq';
        let key = localStorage.getItem(STORAGE_KEY);
        if (key) return key;

        key = prompt("🔑 Bem-vindo à Juris IA!\n\nPor favor, insira sua chave de API da Groq para habilitar as recomendações inteligentes:");
        if (key && key.trim().startsWith("gsk_")) {
            localStorage.setItem(STORAGE_KEY, key.trim());
            return key.trim();
        } else if (key) {
            alert("A chave inserida parece inválida. Chaves da Groq geralmente começam com 'gsk_'.");
        }
        return null;
    }

    async function buscarModelosCompativeis(topicoId, textoAlegacoes) {
        if (!textoAlegacoes || textoAlegacoes.trim() === '') return window.exibirToast?.('Redija os Fundamentos do Agravo primeiro.', 'aviso');
        
        const apiKey = _obterChaveAPI();
        if (!apiKey) return;

        if (typeof window.AcervoManager === 'undefined') {
            if (window.exibirToast) exibirToast('Módulo do Acervo não está carregado.', 'erro');
            return;
        }

        const modelos = await AcervoManager.carregarModelos();
        if (modelos.length === 0) return window.exibirToast?.('Seu acervo está vazio.', 'aviso');

        // PAYLOAD OTIMIZADO: Apenas ID e Título
        const catalogoComprimido = modelos.map(m => `ID: ${m.id} | Título: ${m.nome}`).join("\n");

        const btnIcon = document.querySelector('.preamble-alegacao .ai-trigger-btn');
        if (btnIcon) btnIcon.classList.add('is-thinking');
        if (window.exibirToast) exibirToast('IA analisando o Acervo...', 'info');

        try {
            const prompt = `Atue como um analista jurídico especializado em Admissibilidade Recursal e Agravo de Instrumento. 
Analise a tese/fundamento e encontre os modelos compatíveis no acervo.
TESE / FUNDAMENTOS DO AGRAVO: "${textoAlegacoes}"

ACERVO:
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
                    max_tokens: 800 // Permitimos o raciocínio completo do modelo para evitar truncation
                })
            });

            if (!response.ok) throw new Error("Falha na API da IA.");

            const data = await response.json();
            const respostaBruta = data?.choices?.[0]?.message?.content || "";

            // EXTRAÇÃO BLINDADA: Busca por "NENHUM" dentro do padrão
            if (respostaBruta.includes("NENHUM")) {
                if (window.exibirToast) exibirToast('Nenhum modelo de alta afinidade encontrado.', 'aviso');
                return; 
            }

            // EXTRAÇÃO BLINDADA: Coleta apenas os IDs no padrão 'mod-[qualquer coisa permitida no Firebase]'
            const idsExtraidos = respostaBruta.match(/mod-[a-zA-Z0-9_-]+/g);

            if (!idsExtraidos || idsExtraidos.length === 0) {
                if (window.exibirToast) exibirToast('Nenhum modelo foi classificado como compatível.', 'aviso');
                return;
            }

            console.log("[Juris IA] Recomendações:", idsExtraidos);

            // Abre a UI no Modo IA
            if (typeof aplicarFiltroIAAcervo === 'function') {
                aplicarFiltroIAAcervo(idsExtraidos);
                if (window.exibirToast) exibirToast('Filtro de Inteligência Artificial aplicado ✨', 'sucesso');
            }

        } catch (error) {
            console.error("[Juris IA Error]", error);
            if (window.exibirToast) exibirToast('Falha na comunicação com a Inteligência Artificial.', 'erro');
        } finally {
            if (btnIcon) btnIcon.classList.remove('is-thinking');
        }
    }

    return {
        buscarModelosCompativeis
    };
})();