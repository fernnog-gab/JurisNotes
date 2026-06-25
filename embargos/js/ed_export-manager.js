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
        return `Evidencia_ED_${topicoId}_Card_${hierarquia}.png`;
    }

    /**
     * Motor Privado de Geração de Payload (Roteiro do Diretor em XML/MD)
     * OTIMIZADO COM BUFFERS CONDICIONAIS E MAPEAMENTO LÉXICO
     */
    function _gerarMarkdown(topico) {
        const config = ESQUEMAS_CONTEXTO['ED'];
        const safeFormatTime = (sec) => window.AudioManager?.formatTime ? window.AudioManager.formatTime(sec) : `${Math.floor(sec/60)}' ${Math.floor(sec%60)}''`;

        // Coleta de escopo global (Bubble-up)
        const barreirasAdmissibilidade = [];
        const jurisprudenciaVinculante = [];
        const vereditosLocaisInjetados = []; 
        const diretrizesGlobaisGerais = [];

        let md = `# ${config.tituloTopico}: **${(topico.nome || 'Não Nomeado').toUpperCase()}**\n\n`;

        // 1. COMPILAÇÃO DO ROTEIRO ESTRUTURAL
        md += `<roteiro_diretor_llm>\n`;
        md += `  <incidente_processual>Embargos de Declaração</incidente_processual>\n`;
        md += `  <diretriz_cognitiva_vinculante>${config.diretrizIA}</diretriz_cognitiva_vinculante>\n`;
        md += `</roteiro_diretor_llm>\n\n`;

        md += `## SEÇÃO I — ESCOPO DA AUDITORIA\n\n`;
        md += `<escopo_auditoria>\n`;
        md += `  <alegacao_vicio>\n${_safeMD(topico.alegacoes || 'Nenhum vício apontado.')}\n  </alegacao_vicio>\n`;
        md += `  <decisao_embargada>\n${_safeMD(topico.fundamentos || 'Nenhum trecho da decisão embargada colado.')}\n  </decisao_embargada>\n`;
        md += `</escopo_auditoria>\n\n`;

        // 2. INJEÇÃO DAS DIRETRIZES GLOBAIS DA IA
        if (topico.diretrizesGlobais && topico.diretrizesGlobais.length > 0) {
            const globaisValidas = topico.diretrizesGlobais.filter(dir => dir.intencao !== 'nota');
            if (globaisValidas.length > 0) {
                md += `<premissas_globais_da_auditoria>\n`;
                globaisValidas.forEach(dir => {
                    md += `  - [REGRA GERAL]: ${_safeMD(dir.texto, '\n  ')}\n`; // Correção de blockquote
                });
                md += `</premissas_globais_da_auditoria>\n\n`;
            }
        }

        // CORREÇÃO: BUFFER CONDICIONAL E MAPEAMENTO DE VÍCIO
        let bufferVicios = '';
        if (topico.diretrizesPorVicio && Object.keys(topico.diretrizesPorVicio).length > 0) {
            Object.keys(topico.diretrizesPorVicio).forEach(nomeVicio => {
                const diretrizes = topico.diretrizesPorVicio[nomeVicio];
                if (diretrizes && diretrizes.length > 0) {
                    const diretrizesValidas = diretrizes.filter(dir => dir.intencao !== 'nota');
                    if (diretrizesValidas.length > 0) {
                        bufferVicios += `<vicio_alvo>\n`;
                        bufferVicios += `[NOME DO VÍCIO]: ${_escapeXmlAttr(nomeVicio)}\n`;
                        diretrizesValidas.forEach(dir => {
                             bufferVicios += `[INSTRUÇÃO DE ANÁLISE]: ${_safeMD(dir.texto, '\n')}\n`;
                        });
                        bufferVicios += `</vicio_alvo>\n\n`;
                    }
                }
            });
        }
        
        if (bufferVicios.trim() !== '') {
            md += `<direcionamentos_por_vicio>\n[ATENÇÃO IA]: Aplique estas métricas estritas ao auditar o vício correspondente.\n\n${bufferVicios}</direcionamentos_por_vicio>\n\n`;
        }

        md += `## SEÇÃO II — ${config.rotuloSeccao}\n`;
        md += `*Atenção IA: Aqui estão as provas documentais do vício formal. É proibido reavaliar o mérito originário da causa baseando-se nestes extratos.*\n\n`;

        if (!topico.anotacoes || topico.anotacoes.length === 0) {
            md += `*Nenhum elemento processual foi anexado para auditoria.*\n`;
        } else {
            // 3. ITERAÇÃO PROFUNDA COM ENVELOPAMENTO XML
            topico.anotacoes.forEach((an, idx) => {
                const numIdeia = idx + 1;
                const refCitacao = _formatarCitacaoOficial(an.pjeId, an.pagina);
                const tituloVicio = an.tese ? an.tese : (topico.vicio || 'Auditoria Geral');

                md += `<analise_de_evidencia>\n`;
                md += `[IDENTIFICADOR DA EVIDÊNCIA]: ${numIdeia}\n`;
                md += `[VÍCIO VINCULADO]: ${_escapeXmlAttr(tituloVicio)}\n`;
                
                const faseContexto  = an.fase || an.documento || 'Não especificado';
                const poloContexto  = an.polo || 'N/A';
                md += `<contexto_processual>\nFase: ${faseContexto} | Polo: ${poloContexto} | Ref: ${refCitacao}\n</contexto_processual>\n\n`;

                md += `<fato_bruto_auditado>\n`;
                const docLabel = `**[${an.documento || 'Elemento'}] (${poloContexto}) ${refCitacao}:**`;

                if (an.tipo === 'texto') {
                    md += `- ${docLabel} ${_safeMD(an.conteudo, ' ')}\n`;
                } else if (an.tipo === 'imagem') {
                    const imgNome = _gerarNomeArquivoImagem(topico.id, numIdeia);
                    md += `- ${docLabel}\n  [IMAGEM FORNECIDA PARA CONFERÊNCIA]: (Nome: \`${imgNome}\`).\n  [APONTAMENTO DO ASSESSOR]: ${_safeMD(an.comentario || 'Verifique a falha estrutural demonstrada na imagem.', '\n  ')}\n`;
                } else if (an.tipo === 'audio') {
                    try {
                        const ad = JSON.parse(an.conteudo);
                        const oradorFinal = ad.role || ad.oradorStr || 'Orador não idt.';
                        md += `- ${docLabel} [OITIVA REGISTRADA] (${oradorFinal} — ${safeFormatTime(ad.inicio)} a ${safeFormatTime(ad.fim)}).\n`;
                        if (an.comentario) md += `  [OBSERVAÇÃO]: ${_safeMD(an.comentario, '\n  ')}\n`;
                        if (ad.transcricao) md += `  [DEGRAVAÇÃO LITERAL]: "${_safeMD(ad.transcricao, '\n  ')}"\n`;
                    } catch (e) {
                        md += `- ${docLabel} [ÁUDIO] Resumo: ${_safeMD(an.comentario || 'Sem comentário.', '\n  ')}\n`;
                    }
                }

                // Sub-provas Correlacionadas (Confrontos)
                if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                    an.itensCorrelacionados.forEach((corr, corrIdx) => {
                        const numSub = corrIdx + 1;
                        const cRefCitacao = _formatarCitacaoOficial(corr.pjeId, corr.pagina);
                        const cDocLabel = `  [CONFRONTO DIRETO ${numSub}]: [${corr.documento || 'Doc'}] (${corr.polo || 'Polo'}) ${cRefCitacao}:`;

                        if (corr.tipo === 'texto') {
                            md += `${cDocLabel} ${_safeMD(corr.comentario ? corr.comentario : (corr.conteudo || ''), ' ')}\n`;
                        } else if (corr.tipo === 'imagem') {
                            md += `${cDocLabel}\n    [IMAGEM ANEXA]: \`${_gerarNomeArquivoImagem(topico.id, numIdeia, numSub)}\`\n    [APONTAMENTO]: ${_safeMD(corr.comentario || 'Avalie a incongruência.', '\n    ')}\n`;
                        }
                    });
                }
                
                md += `</fato_bruto_auditado>\n\n`;

                // CORREÇÃO: CONSOLIDAÇÃO DE DIRETRIZES LOCAIS EM UM ÚNICO BUFFER
                let bufferDiretrizesLocais = '';

                const processarNos = (listaNos, refContexto) => {
                    if (!listaNos || listaNos.length === 0) return;
                    
                    const nosValidos = listaNos.filter(sub => sub.intencao !== 'nota');
                    if (nosValidos.length === 0) return;

                    nosValidos.forEach((sub) => {
                        const intencao = sub.intencao || 'fallback';

                        // Tratamento assíncrono para texto literal (Verbatim)
                        if (intencao === 'texto') {
                            const textoExato = _stripInternalTags(sub.texto);
                            bufferDiretrizesLocais += `\n[INSTRUÇÃO DE CÓPIA EXATA${refContexto}]\nTranscreva o bloco de texto abaixo exatamente como ele está escrito, palavra por palavra. Não altere a formatação e não parafraseie.\n<texto_verbatim>\n${textoExato}\n</texto_verbatim>\n\n`;
                        } else {
                            const textoSanitizado = _safeMD(sub.texto, '\n');
                            
                            if (intencao === 'premissa') {
                                bufferDiretrizesLocais += `[CONSTATAÇÃO FORMAL INQUESTIONÁVEL${refContexto}]: ${textoSanitizado}\n`;
                            } else if (intencao === 'refutacao') {
                                bufferDiretrizesLocais += `[AFASTAMENTO DO VÍCIO OBRIGATÓRIO - INEXISTÊNCIA DE FALHA${refContexto}]: ${textoSanitizado}\n`;
                            } else if (intencao === 'comando') {
                                bufferDiretrizesLocais += `[COMANDO DE REDAÇÃO ESTRITO${refContexto}]: ${textoSanitizado}\n`;
                            } else if (intencao === 'fallback') {
                                bufferDiretrizesLocais += `[CONTEXTO FÁTICO COMPLEMENTAR PARA AUDITORIA${refContexto}]: ${textoSanitizado}\n`;
                            } 
                            // Escopo Global: Bubble-up
                            else if (intencao === 'fundamentacao') {
                                jurisprudenciaVinculante.push(`[Aplicável ao item ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                            } else if (intencao === 'preliminar') {
                                barreirasAdmissibilidade.push(`[Item ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                            } else if (intencao === 'veredito') {
                                vereditosLocaisInjetados.push(`[Auditoria da Ideia ${numIdeia}${refContexto}]: ${textoSanitizado}`);
                            }
                        }
                    });
                };

                processarNos(an.subAnotacoes, '');

                if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
                    an.itensCorrelacionados.forEach((corr) => {
                        if (corr.subAnotacoes && corr.subAnotacoes.length > 0) {
                            processarNos(corr.subAnotacoes, ` (Anexo: ${corr.documento || 'Documento'})`);
                        }
                    });
                }

                // Só abre a tag se de fato houverem regras locais (evita a maldição da tag vazia)
                if (bufferDiretrizesLocais.trim() !== '') {
                    md += `<diretrizes_de_auditoria_do_assessor>\n${bufferDiretrizesLocais}</diretrizes_de_auditoria_do_assessor>\n`;
                }

                md += `</analise_de_evidencia>\n\n`;
            });
        }

        // 4. INJEÇÃO GLOBAL (Bordas do Payload)
        if (barreirasAdmissibilidade.length > 0) {
            md += `<barreiras_de_admissibilidade_dos_embargos>\n`;
            md += `*Atenção IA: Resolva estes óbices (ex: intempestividade, inovação) ANTES de auditar o mérito dos embargos.*\n`;
            md += barreirasAdmissibilidade.map(c => `* 🛑 ${c}`).join('\n') + '\n';
            md += `</barreiras_de_admissibilidade_dos_embargos>\n\n`;
        }

        if (jurisprudenciaVinculante.length > 0) {
            md += `<base_legal_e_jurisprudencial>\n`;
            md += jurisprudenciaVinculante.map(c => `* ⚖️ ${c}`).join('\n') + '\n';
            md += `</base_legal_e_jurisprudencial>\n\n`;
        }

        if ((topico.veredito && topico.veredito.trim() !== '') || vereditosLocaisInjetados.length > 0) {
            md += `<${config.tagVeredito}>\n`;
            md += `*Atenção IA: As instruções abaixo ditam o resultado final da auditoria deste embargo.*\n`;
            
            if (topico.veredito && topico.veredito.trim() !== '') {
                md += `[CONCLUSÃO OBRIGATÓRIA GERAL]: ${topico.veredito.replace(/\n/g, ' ')}\n`;
            }
            
            vereditosLocaisInjetados.forEach(v => {
                md += `[CONCLUSÃO PARCIAL ESPECÍFICA]: ${v}\n`;
            });
            
            md += `\n*Redija o dispositivo final (Acolher/Rejeitar, com ou sem efeito modificativo) obedecendo estritamente a este veredito.*\n`;
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
    return {
        init: function (dependencies) {
            _deps = { ..._deps, ...dependencies };
        },

        exportarTopicoAtivo: async function () {
            const activeTabId = _deps.getActiveTabId();
            
            if (!activeTabId) {
                _deps.exibirToast("Selecione um tópico de Embargos antes de exportar.", 'aviso');
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
                const config = ESQUEMAS_CONTEXTO['ED'];
                const nomeSanitizado = (topicoAtivo.nome || 'Exportacao_ED').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                
                // Leitura de estado baseada no DOM (Sem depender de variáveis de janela)
                const tagDom = document.getElementById('tag-numero-processo');
                const numProcesso = tagDom && tagDom.style.display !== 'none' ? tagDom.textContent.trim() : '';
                const baseStr = numProcesso ? `${config.prefixoArquivo}${numProcesso}_` : config.prefixoArquivo;
                
                const nomeArquivoFinal = `${baseStr}${nomeSanitizado}.md`;
                
                const payloadTexto = _gerarMarkdown(topicoAtivo);
                _downloadArquivo(nomeArquivoFinal, payloadTexto);

                _deps.exibirToast('Payload de ED gerado! Preparando imagens...', 'sucesso');

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
        },

        /**
         * Retorna os dados do tópico ativo de forma segura para consumo da UI.
         * Atua como Single Source of Truth, mantendo a regra de negócio blindada.
         * @returns {{ nome: string, markdown: string } | null}
         */
        obterDadosDoTopicoAtivo: function() {
            const activeId = _deps.getActiveTabId();
            if (!activeId) return null;

            const topicosArray = _deps.getTopicos();
            if (!topicosArray || !Array.isArray(topicosArray)) return null;

            const topicoAtivo = topicosArray.find(t => t.id === activeId);
            if (!topicoAtivo || !topicoAtivo.anotacoes || topicoAtivo.anotacoes.length === 0) return null;

            return {
                nome: topicoAtivo.nome || 'Vício Não Nomeado',
                markdown: _gerarMarkdown(topicoAtivo)
            };
        }
    };

})();