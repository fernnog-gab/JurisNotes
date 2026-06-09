/**
 * ============================================================================
 * ed_export-manager.js — v6.0 Core Architect (Refatorado)
 * Módulo Orquestrador de Payload Estruturado para Modelos de Linguagem (LLM)
 * ============================================================================
 */
window.ExportManager = (function () {
    'use strict';

    // Armazém local para as dependências injetadas pelo orquestrador (app-core)
    let _deps = {
        getTopicos: () => [],
        exibirToast: () => {},
        getActiveTabId: () => null
    };

    // CONFIGURAÇÃO CENTRALIZADA DE CONTEXTOS PROCESSUAIS (Arquitetura Base-2)
    const ESQUEMAS_CONTEXTO = {
        'RO': {
            prefixoArquivo: "Pacote_JurisNotes_",
            tituloTopico: "TÓPICO RECURSAL PRINCIPAL",
            rotuloSeccao: "MATRIZ DIALÉTICA DE MÉRITO",
            tagAlegacao: "teses_recursais",
            tagFundamento: "fundamentos_da_origem",
            tagVeredito: "decisao_magistrado_pretendida",
            diretrizIA: "Analise o efeito devolutivo amplo. Avalie o confronto dialético entre as razões do recurso e os fundamentos da sentença de primeiro grau."
        },
        'ED': {
            prefixoArquivo: "Pacote_ED_JurisNotes_",
            tituloTopico: "VÍCIO EMBARGADO (AUDITORIA ESTRITA)",
            rotuloSeccao: "MATRIZ DE HIGIDEZ ESTRUTURAL",
            tagAlegacao: "vicio_alegado",
            tagFundamento: "decisao_embargada",
            tagVeredito: "veredito_assessor",
            diretrizIA: "Atue estritamente sob a lente de auditoria da higidez formal da decisão. Limite-se a sanar Omissão, Contradição ou Erro Material. É EXPRESSAMENTE PROIBIDO reexaminar provas de mérito fático ou promover o rejulgamento da causa. Adote os princípios do Visual Law e Linguagem Simples: formalidade acessível, clareza absoluta e eliminação de hermetismos jurídicos."
        }
    };

    /**
     * Utilitário de pausa para cadência de execução assíncrona
     */
    const _sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Sanitiza strings prevenindo quebras acidentais de templates literais XML/Markdown
     */
    function _safeMD(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Motor Privado Unificado de Geração de Payloads Estruturados em Markdown/XML
     */
    function _gerarMarkdown(topico, contexto = 'RO') {
        const config = ESQUEMAS_CONTEXTO[contexto] || ESQUEMAS_CONTEXTO['RO'];
        let md = `# ${config.tituloTopico}: ${topico.nome.toUpperCase()}\n\n`;

        // 1. COMPILAÇÃO DO PREÂMBULO FIXO (Camada de Direcionamento)
        md += `<RoteiroDiretor>\n`;
        md += `  <incidente_processual>${contexto === 'ED' ? 'Embargos de Declaração' : 'Recurso Ordinário'}</incidente_processual>\n`;
        md += `  <diretriz_cognitiva>${config.diretrizIA}</diretriz_cognitiva>\n`;
        md += `</RoteiroDiretor>\n\n`;

        md += `## SEÇÃO I — ELEMENTOS BALIZADORES DE DIRECIONAMENTO\n\n`;
        md += `<${config.tagAlegacao}>\n${_safeMD(topico.alegacoes || 'Nenhum apontamento registrado.')}\n</${config.tagAlegacao}>\n\n`;
        md += `<${config.tagFundamento}>\n${_safeMD(topico.fundamentos || 'Nenhum trecho colado.')}\n</${config.tagFundamento}>\n\n`;
        md += `<${config.tagVeredito}>\n${_safeMD(topico.veredito || 'Nenhuma conclusão delimitada.')}\n</${config.tagVeredito}>\n\n`;

        md += `## SEÇÃO II — ${config.rotuloSeccao}\n\n`;

        if (!topico.anotacoes || topico.anotacoes.length === 0) {
            md += `*Nenhum elemento probatório fático foi anexado a este tópico.*\n`;
            return md;
        }

        // 2. ITERAÇÃO PROFUNDA DA ÁRVORE DE ANOTAÇÕES (Preservação de Intenções v3.1.1)
        topico.anotacoes.forEach((anotacao, idx) => {
            if (anotacao.intencao === 'nota') return; // Filtro de Notas Internas Ocultas

            const numCard = idx + 1;
            md += `### [CARD_EVIDENCIA_${numCard}] (Documento: ${anotacao.documento || 'Não Identificado'})\n`;
            md += `- **Polo Vinculado:** ${anotacao.polo || 'Neutro'}\n`;
            if (anotacao.pagina) md += `- **Localização Processual:** fl. ${anotacao.pagina}\n`;
            md += `\n<DADO_BRUTO_PROVA>\n`;

            if (anotacao.tipo === 'texto') {
                md += `"${_safeMD(anotacao.conteudo)}"\n`;
            } else if (anotacao.tipo === 'imagem') {
                const nomeImg = `imagem_prova_${topico.id}_${numCard}.png`;
                md += `![Evidência Visual Contextual](./imagens/${nomeImg})\n`;
            } else if (anotacao.tipo === 'audio') {
                md += `[Metadados de Oitiva de Audiência Assinalados]\n`;
            }

            md += `</DADO_BRUTO_PROVA>\n`;

            if (anotacao.comentario) {
                md += `<analise_valotativa_assessor>\n${_safeMD(anotacao.comentario)}\n</analise_valotativa_assessor>\n`;
            }

            // Processamento dos Nós de Ideia Secundários Anexados (Sub-Anotações)
            if (anotacao.subAnotacoes && anotacao.subAnotacoes.length > 0) {
                md += `\n  \n`;
                anotacao.subAnotacoes.forEach((sub, sIdx) => {
                    const tagIntencao = sub.intencao || 'premissa_logica';
                    md += `  <no_ideia_secundario foco="${tagIntencao}">\n`;
                    md += `    ${_safeMD(sub.texto)}\n`;
                    md += `  </no_ideia_secundario>\n`;
                });
            }

            // Iteração Segura sobre Itens Correlacionados (Sub-provas Agrupadas)
            if (anotacao.itensCorrelacionados && anotacao.itensCorrelacionados.length > 0) {
                md += `\n  <provas_faticas_correlacionadas_agrupadas>\n`;
                anotacao.itensCorrelacionados.forEach((item, cIdx) => {
                    md += `    <sub_evidencia id="${numCard}_${cIdx}" tipo="${item.type || 'mídia'}">\n`;
                    md += `      ${_safeMD(item.conteudo || item.comentario)}\n`;
                    md += `    </sub_evidencia>\n`;
                });
                md += `  </provas_faticas_correlacionadas_agrupadas>\n`;
            }

            md += `\n---\n\n`;
        });

        return md;
    }

    /**
     * Simula o download nativo do arquivo em formato Markdown no Navegador
     */
    function _downloadArquivo(nomeArquivo, conteudoTexto) {
        const blob = new Blob([conteudoTexto], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", nomeArquivo);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Varre as anotações compilando uma fila sequencial estável de blobs de imagens.
     * Utiliza execução assíncrona para contornar bloqueios anti-spam dos navegadores.
     */
    async function _executarFilaDeDownloads(topico) {
        if (!topico.anotacoes || !Array.isArray(topico.anotacoes)) return;

        // Extrai todas as imagens (principais e correlacionadas) para uma fila plana
        const filaDownloads = [];

        topico.anotacoes.forEach((an, idx) => {
            if (an.tipo === 'imagem' && an.conteudo && an.conteudo.startsWith('blob:')) {
                filaDownloads.push({
                    url: an.conteudo,
                    nome: `imagem_prova_${topico.id}_${idx + 1}.png`
                });
            }
            
            if (an.itensCorrelacionados && Array.isArray(an.itensCorrelacionados)) {
                an.itensCorrelacionados.forEach((subItem, sIdx) => {
                    if (subItem.tipo === 'imagem' && subItem.conteudo && subItem.conteudo.startsWith('blob:')) {
                        filaDownloads.push({
                            url: subItem.conteudo,
                            nome: `imagem_prova_${topico.id}_${idx + 1}_sub_${sIdx + 1}.png`
                        });
                    }
                });
            }
        });

        // Processa a fila com delay estratégico simulando o clique humano
        for (const arquivo of filaDownloads) {
            const link = document.createElement('a');
            link.href = arquivo.url;
            link.setAttribute('download', arquivo.nome);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link); // Limpeza imediata do DOM para não vazar memória
            
            // Pausa de 350ms para evitar bloqueio de múltiplos downloads
            await _sleep(350); 
        }
    }

    /**
     * ========================================================================
     * API PÚBLICA EXPOSTA DO MÓDULO (ENCAPSULAMENTO SEGURO IIFE)
     * ========================================================================
     */
    return {
        // Inicializador de dependências restaurado para o app-core
        init: function (dependencies) {
            _deps = { ..._deps, ...dependencies };
        },

        // Agora é uma função assíncrona para permitir o controle da fila
        exportarTopicoAtivo: async function (contexto = 'RO') {
            const activeTabId = _deps.getActiveTabId();
            
            if (!activeTabId) {
                console.warn("[ExportManager] Nenhuma aba ativa identificada para exportação.");
                return;
            }

            // Busca segura e validação rigorosa do tipo de retorno
            const topicosArray = _deps.getTopicos();
            
            if (!Array.isArray(topicosArray)) {
                console.error("[ExportManager] Falha crítica: getTopicos() não retornou um array válido.");
                return;
            }

            const topicoAtivo = topicosArray.find(t => t.id === activeTabId);

            if (!topicoAtivo) {
                alert("Erro: Não foi possível mapear os dados do tópico ativo.");
                return;
            }

            const config = ESQUEMAS_CONTEXTO[contexto] || ESQUEMAS_CONTEXTO['RO'];
            const nomeArquivoFinal = `${config.prefixoArquivo}${topicoAtivo.nome.replace(/[^a-zA-Z0-9]/g, '_')}.md`;

            // Execução do pipeline
            const payloadTexto = _gerarMarkdown(topicoAtivo, contexto);
            
            // 1. Download síncrono do arquivo Markdown
            _downloadArquivo(nomeArquivoFinal, payloadTexto);

            // 2. Disparo sequencial e assíncrono das evidências atreladas
            await _executarFilaDeDownloads(topicoAtivo);
        }
    };

})();