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
        },
        // INJEÇÃO DA NOVA MATRIZ COGNITIVA
        'AI': {
            prefixoArquivo: "Pacote_AI_JurisNotes_",
            tituloTopico: "AUDITORIA DE ADMISSIBILIDADE (AGRAVO DE INSTRUMENTO)",
            rotuloSeccao: "MATRIZ DE VERIFICAÇÃO DE PRESSUPOSTOS",
            tagAlegacao: "fundamentos_do_agravo",
            tagFundamento: "decisao_denegatoria_originaria",
            tagVeredito: "veredito_assessor_admissibilidade",
            diretrizIA: "Atue como auditor rigoroso de pressupostos processuais. Seu objetivo é analisar estritamente se o Agravo de Instrumento merece ser conhecido (destrancando o recurso originário) com base em tempestividade, adequação, preparo e representação. Não avalie o mérito da causa principal. Preste extrema atenção à natureza do documento anexado (Ex: Guias comprovam preparo; Certidões e Manifestações comprovam tempestividade; Procurações provam representação). Justifique a admissibilidade cruzando o tipo da prova com o pressuposto alegado."
        }
    };

    /**
     * Remove sintaxes exclusivas de renderização da UI (ex: [[size:2]])
     * Evita vazamento de pseudo-código inútil para o LLM.
     */
    function _stripInternalTags(texto) {
        if (!texto) return '';
        return String(texto).replace(/\[\[\/?size(:\d)?\]\]/g, '');
    }

    /**
     * Sanitiza conteúdo para evitar quebras no Markdown
     */
    function _safeMD(str, prefixo = '') {
        if (!str) return '';
        const textoLimpo = _stripInternalTags(String(str));
        return textoLimpo.replace(/\n/g, prefixo);
    }

    /**
     * Sanitiza atributos para injeção segura em tags XML.
     * Previne quebra de payload por aspas duplas no nome do vício.
     */
    function _escapeXmlAttr(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Formata a citação oficial de referência cruzada.
     */
    function _formatarCitacaoOficial(pjeId, pagina) {
        const strId = pjeId   ? `Id ${pjeId}`   : 'Id não idt.';
        const strFl = pagina  ? `fl ${pagina}`  : 'fl não idt.';
        return `(${strId} - ${strFl})`;
    }

    /**
     * Gera nome estruturado para download de imagens
     */
    function _gerarNomeArquivoImagem(topicoId, numIdeia, numSub = null) {
        const hierarquia = numSub ? `${numIdeia}_sub_${numSub}` : `${numIdeia}`;
        const modulo = window.JURIS_MODULE || 'AI';
        return `Evidencia_${modulo}_${topicoId}_Card_${hierarquia}.png`;
    }

    /**
     * Motor Privado de Geração de Payload (Roteiro do Diretor em XML/MD)
     * OTIMIZADO PARA AGRAVO DE INSTRUMENTO (Admissibilidade)
     */
    function _gerarMarkdown(topico) {
        // Fallback seguro para o Agravo
        const moduleContext = window.JURIS_MODULE || 'AI'; 
        const config = ESQUEMAS_CONTEXTO[moduleContext];
        const dataGeracao = new Date().toLocaleString('pt-BR');
        const safeFormatTime = (sec) => window.AudioManager?.formatTime ? window.AudioManager.formatTime(sec) : `${Math.floor(sec/60)}' ${Math.floor(sec%60)}''`;

        // Coleta de escopo global (Bubble-up)
        const barreirasAdmissibilidade = [];
        const jurisprudenciaVinculante = [];
        const vereditosLocaisInjetados = []; 

        let md = `---\n*Pacote de Auditoria de Admissibilidade (${moduleContext}) gerado em ${dataGeracao}*\n---\n\n`;
        md += `# ${config.tituloTopico}: **${(topico.nome || 'Não Nomeado').toUpperCase()}**\n\n`;

        // 1. COMPILAÇÃO DO ROTEIRO ESTRUTURAL
        md += `<roteiro_diretor_llm>\n`;
        md += `  <incidente_processual>Agravo de Instrumento</incidente_processual>\n`;
        md += `  <diretriz_cognitiva_vinculante>${config.diretrizIA}</diretriz_cognitiva_vinculante>\n`;
        md += `</roteiro_diretor_llm>\n\n`;

        md += `## SEÇÃO I — ESCOPO DO TRANCAMENTO\n\n`;
        md += `<${config.tagAlegacao}>\n${_safeMD(topico.alegacoes || 'Nenhum argumento do agravo descrito.')}\n</${config.tagAlegacao}>\n\n`;
        md += `<${config.tagFundamento}>\n${_safeMD(topico.fundamentos || 'Nenhum trecho da decisão denegatória colado.')}\n</${config.tagFundamento}>\n\n`;

        // 2. INJEÇÃO DAS DIRETRIZES GLOBAIS
        if (topico.diretrizesGlobais && topico.diretrizesGlobais.length > 0) {
            md += `<premissas_globais_de_admissibilidade>\n`;
            topico.diretrizesGlobais.forEach(dir => {
                md += `  - [REGRA DE AUDITORIA GERAL]: ${_safeMD(dir.texto, '\n  ')}\n`;
            });
            md += `</premissas_globais_de_admissibilidade>\n\n`;
        }

        // CORREÇÃO: RESTAURAÇÃO DO NÍVEL INTERMEDIÁRIO (Diretrizes por Pressuposto/Tese)
        let bufferPressupostos = '';
        // Em AI, tratamos "Tese" como "Pressuposto" (ex: Tempestividade, Preparo)
        const diretrizesPorTeseOuVicio = topico.diretrizesPorTese || topico.diretrizesPorVicio || {};
        
        if (Object.keys(diretrizesPorTeseOuVicio).length > 0) {
            Object.keys(diretrizesPorTeseOuVicio).forEach(nomePressuposto => {
                const diretrizes = diretrizesPorTeseOuVicio[nomePressuposto];
                if (diretrizes && diretrizes.length > 0) {
                    bufferPressupostos += `  <pressuposto_alvo nome="${_escapeXmlAttr(nomePressuposto)}">\n`;
                    diretrizes.forEach(dir => {
                         bufferPressupostos += `    - [MÉTRICA DE VALIDAÇÃO]: ${_safeMD(dir.texto, '\n    ')}\n`;
                    });
                    bufferPressupostos += `  </pressuposto_alvo>\n`;
                }
            });
        }
        
        if (bufferPressupostos.trim() !== '') {
            md += `<direcionamentos_por_pressuposto>\n*Atenção IA: Aplique estas métricas estritas ao auditar o respectivo pressuposto.* \n\n${bufferPressupostos}</direcionamentos_por_pressuposto>\n\n`;
        }
        
        md += `## SEÇÃO II — ${config.rotuloSeccao}\n`;
        md += `*Atenção IA: Avalie estritamente os requisitos extrínsecos e intrínsecos documentados abaixo. É VEDADO julgar o mérito originário da causa.*\n\n`;

        if (!topico.anotacoes || topico.anotacoes.length === 0) {
            md += `*Nenhum documento foi anexado para auditoria de admissibilidade.*\n`;
        } else {
            // 3. ITERAÇÃO DE EVIDÊNCIAS (Provas do Agravo)
            topico.anotacoes.forEach((an, idx) => {
                const numIdeia = idx + 1;
                const refCitacao = _formatarCitacaoOficial(an.pjeId, an.pagina);
                // "Tese" no AI vira o "Pressuposto Auditado"
                const pressupostoContexto = an.tese ? an.tese : (topico.vicio || 'Pressuposto Geral');

                // Mapeamento cruzado perfeito: pressuposto="..." conversa com <pressuposto_alvo nome="...">
                md += `<analise_de_evidencia id="${numIdeia}" pressuposto="${_escapeXmlAttr(pressupostoContexto)}">\n`;
                
                const faseContexto  = an.fase || an.documento || 'Não especificado';
                const poloContexto  = an.polo || 'N/A';
                md += `<contexto_processual>Fase: ${faseContexto} | Origem Documento: ${poloContexto} | Ref: ${refCitacao}</contexto_processual>\n\n`;

                md += `<documento_probatorio_anexado>\n`;
                const docLabel = `**[${an.documento || 'Comprovante'}] ${refCitacao}:**`;

                if (an.tipo === 'texto') {
                    md += `- ${docLabel} ${_safeMD(an.conteudo, ' ')}\n`;
                } else if (an.tipo === 'imagem') {
                    const imgNome = _gerarNomeArquivoImagem(topico.id, numIdeia);
                    md += `- ${docLabel}\n  > 🖼️ **[IMAGEM DE COMPROVANTE FORNECIDA]** (Nome: \`${imgNome}\`).\n  > 🧠 *Nota do Assessor:* ${_safeMD(an.comentario || 'Verifique o dado contido nesta guia/certidão.', '\n  > ')}\n`;
                } else if (an.tipo === 'audio') {
                    md += `- ${docLabel} 🎙️ **[ÁUDIO REGISTRADO]** *Resumo:* ${_safeMD(an.comentario || 'Sem comentário.', '\n  > ')}\n`;
                }

                // Confrontos (Ex: Comprovante de Pagamento VS Despacho Denegatório)
                if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                    an.itensCorrelacionados.forEach((corr, corrIdx) => {
                        const numSub = corrIdx + 1;
                        const cRefCitacao = _formatarCitacaoOficial(corr.pjeId, corr.pagina);
                        const cDocLabel = `  ↳ *Confronto Direto [${corr.documento || 'Doc'}] ${cRefCitacao}:*`;

                        if (corr.tipo === 'texto') {
                            md += `${cDocLabel} ${_safeMD(corr.comentario ? corr.comentario : (corr.conteudo || ''), ' ')}\n`;
                        } else if (corr.tipo === 'imagem') {
                            md += `${cDocLabel}\n    > 🖼️ **[IMAGEM ANEXA: \`${_gerarNomeArquivoImagem(topico.id, numIdeia, numSub)}\`]**\n    > 🧠 *Apontamento:* ${_safeMD(corr.comentario || 'Avalie a validade.', '\n    > ')}\n`;
                        }
                    });
                }
                
                md += `</documento_probatorio_anexado>\n\n`;

                // BUFFER CONDICIONAL: DIRETRIZES LOCAIS
                let bufferDiretrizesLocais = '';

                const processarNos = (listaNos, refContexto) => {
                    if (!listaNos || listaNos.length === 0) return;
                    
                    listaNos.forEach((sub) => {
                        const intencao = sub.intencao || 'fallback';
                        if (intencao === 'nota') return; 
                        
                        const textoSanitizado = _safeMD(sub.texto, '\n  ');

                        if (intencao === 'premissa') {
                            bufferDiretrizesLocais += `[CONSTATAÇÃO FORMAL INQUESTIONÁVEL${refContexto}]: ${textoSanitizado}\n`;
                        } else if (intencao === 'refutacao') {
                            bufferDiretrizesLocais += `[AFASTAMENTO DO ÓBICE - PRESSUPOSTO ATENDIDO${refContexto}]: ${textoSanitizado}\n`;
                        } else if (intencao === 'comando') {
                            bufferDiretrizesLocais += `[COMANDO DE REDAÇÃO ESTRITO${refContexto}]: ${textoSanitizado}\n`;
                        } else if (intencao === 'texto') {
                            bufferDiretrizesLocais += `[COPIAR E COLAR EXATAMENTE ESTE TEXTO${refContexto}]: "${textoSanitizado}"\n`;
                        } else if (intencao === 'fallback') {
                            bufferDiretrizesLocais += `[CONTEXTO COMPLEMENTAR${refContexto}]: ${textoSanitizado}\n`;
                        } 
                        // Escopo Global: Bubble-up
                        else if (intencao === 'fundamentacao') {
                            jurisprudenciaVinculante.push(`[Referente ao item ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                        } else if (intencao === 'preliminar') {
                            barreirasAdmissibilidade.push(`[Óbice extrínseco ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                        } else if (intencao === 'veredito') {
                            vereditosLocaisInjetados.push(`[Auditoria da Ideia ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                        }
                    });
                };

                processarNos(an.subAnotacoes, '');

                if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                    an.itensCorrelacionados.forEach((corr) => {
                        if (corr.subAnotacoes && corr.subAnotacoes.length > 0) {
                            processarNos(corr.subAnotacoes, ` (Anexo: ${corr.documento || 'Comprovante'})`);
                        }
                    });
                }

                // Blindagem contra tag vazia
                if (bufferDiretrizesLocais.trim() !== '') {
                    md += `<diretrizes_de_auditoria_do_assessor>\n${bufferDiretrizesLocais}</diretrizes_de_auditoria_do_assessor>\n`;
                }

                md += `</analise_de_evidencia>\n\n`;
            });
        }

        // 4. INJEÇÃO GLOBAL (Bordas do Payload)
        if (barreirasAdmissibilidade.length > 0) {
            md += `<barreiras_intransponiveis_ao_agravo>\n`; // Corrigido jargão ED
            md += `*Atenção IA: Óbices fatais (ex: preclusão, erro grosseiro). Aplique ANTES de analisar os demais requisitos.*\n`;
            md += barreirasAdmissibilidade.map(c => `* 🛑 ${c}`).join('\n') + '\n';
            md += `</barreiras_intransponiveis_ao_agravo>\n\n`;
        }

        if (jurisprudenciaVinculante.length > 0) {
            md += `<base_legal_e_jurisprudencial>\n`;
            md += jurisprudenciaVinculante.map(c => `* ⚖️ ${c}`).join('\n') + '\n';
            md += `</base_legal_e_jurisprudencial>\n\n`;
        }

        if ((topico.veredito && topico.veredito.trim() !== '') || vereditosLocaisInjetados.length > 0) {
            md += `<${config.tagVeredito}>\n`;
            md += `*Atenção IA: Estas instruções ditam o veredito da admissibilidade do recurso.*\n`;
            
            if (topico.veredito && topico.veredito.trim() !== '') {
                md += `[CONCLUSÃO OBRIGATÓRIA GERAL]: ${topico.veredito.replace(/\n/g, ' ')}\n`;
            }
            
            vereditosLocaisInjetados.forEach(v => {
                md += `[CONCLUSÃO PARCIAL ESPECÍFICA]: ${v}\n`;
            });
            
            md += `\n*Redija o dispositivo final (Conhecer/Não Conhecer, Dar/Negar Provimento ao Agravo para destrancar o recurso principal) obedecendo estritamente a este veredito.*\n`;
            md += `</${config.tagVeredito}>\n`;
        }

        return md;
    }

    /**
     * Download seguro do arquivo Markdown
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
     * Download sequencial seguro de imagens (Herdado do RO - Previne bloqueio de navegador)
     */
    async function _downloadImagemSegura(base64Data, nomeArquivoBase) {
        try {
            const response = await fetch(base64Data);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = nomeArquivoBase;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            await new Promise(resolve => setTimeout(resolve, 50));
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(`[ExportManager ED] Falha ao baixar imagem "${nomeArquivoBase}":`, e);
        }
    }

    async function _executarFilaDeDownloads(fila) {
        if (!fila || fila.length === 0) return;
        _deps.exibirToast(`Iniciando download de ${fila.length} evidência(s)...`, 'info');
        for (const item of fila) {
            await _downloadImagemSegura(item.dados, item.nome);
            await new Promise(resolve => setTimeout(resolve, 650)); // Delay estratégico
        }
        _deps.exibirToast('Todas as evidências foram baixadas.', 'sucesso');
    }

    // ========================================================================
    // API PÚBLICA
    // ========================================================================
    
    /**
     * Retorna os dados do tópico ativo de forma segura para consumo da UI.
     * Atua como Single Source of Truth, mantendo a regra de negócio blindada.
     * @returns {{ nome: string, markdown: string } | null}
     */
    function obterDadosDoTopicoAtivo() {
        const activeTabId = _deps.getActiveTabId();
        if (!activeTabId) return null;

        const topicosArray = _deps.getTopicos();
        if (!topicosArray || !Array.isArray(topicosArray)) return null;

        const topicoAtivo = topicosArray.find(t => t.id === activeTabId);
        if (!topicoAtivo || !topicoAtivo.anotacoes || topicoAtivo.anotacoes.length === 0) return null;

        return {
            nome: topicoAtivo.nome || 'Tópico Sem Nome',
            markdown: _gerarMarkdown(topicoAtivo)
        };
    }

    return {
        obterDadosDoTopicoAtivo,
        
        init: function (dependencies) {
            _deps = { ..._deps, ...dependencies };
        },

        exportarTopicoAtivo: async function () {
            const activeTabId = _deps.getActiveTabId();
            
            if (!activeTabId) {
                _deps.exibirToast(`Selecione um tópico de ${window.JURIS_MODULE || 'Agravo'} antes de exportar.`, 'aviso');
                return;
            }

            const topicosArray = _deps.getTopicos();
            const topicoAtivo = topicosArray.find(t => t.id === activeTabId);

            if (!topicoAtivo || !topicoAtivo.anotacoes || topicoAtivo.anotacoes.length === 0) {
                _deps.exibirToast("O tópico está vazio ou inválido.", 'aviso');
                return;
            }

            // GUARDRAIL TAREFAS PENDENTES
            if (window.BalancaManager && window.BalancaManager.getPendingTasks() > 0) {
                const count = window.BalancaManager.getPendingTasks();
                const msg = `ATENÇÃO: Existem ${count} tarefa(s) pendente(s) não concluídas no Painel da Balança.\n\nTem certeza de que deseja gerar o pacote de exportação de Embargos mesmo assim?`;
                
                if (!confirm(msg)) {
                    _deps.exibirToast('Exportação interrompida pelo usuário.', 'aviso');
                    return;
                }
            }

            try {
                // 1. Gera e baixa o Markdown
                const config = ESQUEMAS_CONTEXTO[window.JURIS_MODULE || 'ED'];
                const nomeSanitizado = (topicoAtivo.nome || 'Exportacao_ED').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                const nomeArquivoFinal = `${config.prefixoArquivo}${nomeSanitizado}.md`;
                
                const payloadTexto = _gerarMarkdown(topicoAtivo);
                _downloadArquivo(nomeArquivoFinal, payloadTexto);

                _deps.exibirToast(`Payload de ${window.JURIS_MODULE || 'AI'} gerado! Preparando imagens...`, 'sucesso');

                // 2. Prepara e dispara fila de imagens
                const filaDeDownloads = [];
                topicoAtivo.anotacoes.forEach((an, idx) => {
                    const numIdeia = idx + 1;
                    if (an.tipo === 'imagem') {
                        filaDeDownloads.push({ dados: an.conteudo, nome: _gerarNomeArquivoImagem(topicoAtivo.id, numIdeia) });
                    }
                    if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                        an.itensCorrelacionados.forEach((corr, corrIdx) => {
                            if (corr.tipo === 'imagem') {
                                filaDeDownloads.push({ dados: corr.conteudo, nome: _gerarNomeArquivoImagem(topicoAtivo.id, numIdeia, corrIdx + 1) });
                            }
                        });
                    }
                });

                await _executarFilaDeDownloads(filaDeDownloads);

            } catch (error) {
                console.error('[ExportManager ED] Erro crítico na exportação:', error);
                _deps.exibirToast('Erro ao exportar Embargos. Verifique o console.', 'erro');
            }
        }
    };

})();