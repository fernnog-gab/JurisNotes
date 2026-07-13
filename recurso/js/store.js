/* ================================================
   store.js
   Gerenciamento de Estado Centralizado (Redux-Pattern)
   ================================================ */
window.Store = (function() {
    'use strict';
    
    let state = { topicos: window.topicos || [], activeTabId: null };
    const subscribers = [];
    
    function applyMiddlewares(action, oldState, newState) {
        // Removido temporariamente ADD_ITEM, REORDER_ITEM e UPDATE_ITEM para evitar I/O fantasma
        const mutatingActions = [
            'ADD_SUB_ANNOTATION', 'DELETE_SUB_ANNOTATION', 'TOGGLE_REVISION',
            'ADD_THESIS_DIRECTIVE', 'DELETE_THESIS_DIRECTIVE', 
            'ADD_GLOBAL_DIRECTIVE', 'DELETE_GLOBAL_DIRECTIVE', 'DELETE_ITEM',
            'UPDATE_ITEM', 'REORDER_ITEM', 'DND_DROP_ITEM'
        ];
        
        if (mutatingActions.includes(action.type)) {
            // PONTE LEGADA: Atualiza a variável global APENAS se houve mutação real
            window.topicos = newState.topicos;

            // Desacopla o I/O da thread principal da UI
            setTimeout(() => {
                if (window.salvarBackupAutomatico) window.salvarBackupAutomatico();
                if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
            }, 0);
        }
    }

    function _resolveTargetNode(topico, parentIndex, viewSource) {
        if (viewSource === 'global') return { subAnotacoes: topico.diretrizesGlobais };
        if (typeof viewSource === 'string' && viewSource.startsWith('tese:')) {
            const nomeTese = viewSource.replace('tese:', '');
            return { subAnotacoes: topico.diretrizesPorTese[nomeTese] };
        }
        const cardMestre = topico.anotacoes[parentIndex];
        if (viewSource === 'main') return cardMestre;
        return cardMestre.itensCorrelacionados[parseInt(viewSource, 10)];
    }

    function dispatch(action) {
        const oldState = state;
        const newState = structuredClone(state); // Imutabilidade via V8 Clone

        switch (action.type) {
            case 'LOAD_BACKUP': {
                newState.topicos = action.payload;
                break;
            }
            case 'SET_TAB': {
                newState.activeTabId = action.payload;
                break;
            }
            case 'ADD_THESIS_DIRECTIVE': {
                const { topicoId, teseNome, noIdeia } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    if (!topico.diretrizesPorTese) topico.diretrizesPorTese = {};
                    if (!topico.diretrizesPorTese[teseNome]) topico.diretrizesPorTese[teseNome] = [];
                    noIdeia.uuid = noIdeia.uuid || 'id-' + crypto.randomUUID();
                    topico.diretrizesPorTese[teseNome].push(noIdeia);
                }
                break;
            }
            case 'ADD_SUB_ANNOTATION': {
                const { topicoId, parentIndex, viewSource, noIdeia } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    const alvo = _resolveTargetNode(topico, parentIndex, viewSource);
                    if (!alvo.subAnotacoes) alvo.subAnotacoes = [];
                    alvo.subAnotacoes.push(noIdeia);
                }
                break;
            }
            case 'DELETE_SUB_ANNOTATION': {
                const { topicoId, parentIndex, viewSource, localIndex } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    const alvo = _resolveTargetNode(topico, parentIndex, viewSource);
                    if (alvo && alvo.subAnotacoes) alvo.subAnotacoes.splice(localIndex, 1);
                }
                break;
            }
            case 'TOGGLE_REVISION': {
                const { topicoId, parentIndex, viewSource, localIndex } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    const alvo = _resolveTargetNode(topico, parentIndex, viewSource);
                    const sub = alvo.subAnotacoes[localIndex];
                    if (sub) sub.revisada = !sub.revisada;
                }
                break;
            }
            case 'DELETE_ITEM': {
                const { topicoId, index, isPromoting } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (!topico) break;

                if (isPromoting) {
                    const cloneProfundo = structuredClone(topico.anotacoes[index]);
                    const novoMainCard = cloneProfundo.itensCorrelacionados.shift();
                    novoMainCard.tese = cloneProfundo.tese;
                    novoMainCard.itensCorrelacionados = cloneProfundo.itensCorrelacionados;
                    topico.anotacoes[index] = novoMainCard;
                } else {
                    topico.anotacoes.splice(index, 1);
                }
                break;
            }
            case 'UPDATE_ITEM': {
                const { topicoId, tipo, parentIndex, cIdx, localIndex, viewSource, campo, novoValor } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (!topico) break;

                if (tipo === 'preambulo') {
                    topico[campo] = novoValor;
                } else if (tipo === 'main') {
                    topico.anotacoes[parentIndex][campo || 'conteudo'] = novoValor;
                } else if (tipo === 'sub') {
                    const alvo = _resolveTargetNode(topico, parentIndex, viewSource);
                    alvo.subAnotacoes[localIndex][campo || 'texto'] = novoValor;
                } else if (tipo === 'correlated') {
                    topico.anotacoes[parentIndex].itensCorrelacionados[cIdx][campo || 'conteudo'] = novoValor;
                }
                break;
            }
            case 'REORDER_ITEM': {
                const { tipo, topicoId, index, subIndex, viewSource, novaPos } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (!topico) break;

                if (tipo === 'main') {
                    const [item] = topico.anotacoes.splice(index, 1);
                    topico.anotacoes.splice(novaPos - 1, 0, item);
                } else if (tipo === 'sub') {
                    const alvo = _resolveTargetNode(topico, index, viewSource);
                    const [item] = alvo.subAnotacoes.splice(subIndex, 1);
                    alvo.subAnotacoes.splice(novaPos - 1, 0, item);
                }
                break;
            }
            case 'DND_DROP_ITEM': {
                const { targetTopicoId, targetParentIndex, targetCIdx, src } = action.payload;
                const topico = newState.topicos.find(t => t.id === targetTopicoId);
                if (!topico) break;
                
                const cardOriginal = topico.anotacoes[targetParentIndex];
                
                if (targetCIdx === 'main' && src.cIdx !== null && src.cIdx !== 'main') {
                    const estadoClonado = structuredClone(cardOriginal);
                    const itemArrastado = estadoClonado.itensCorrelacionados.splice(src.cIdx, 1)[0];
                    
                    const oldMain = structuredClone(estadoClonado);
                    oldMain.itensCorrelacionados = []; oldMain.tese = "";
                    
                    estadoClonado.itensCorrelacionados.unshift(oldMain);
                    
                    itemArrastado.itensCorrelacionados = estadoClonado.itensCorrelacionados;
                    itemArrastado.tese = estadoClonado.tese;

                    topico.anotacoes[targetParentIndex] = itemArrastado;
                } else if (src.cIdx === 'main' && targetCIdx !== 'main' && targetCIdx !== null) {
                    const estadoClonado = structuredClone(cardOriginal);
                    const novoMestre = estadoClonado.itensCorrelacionados.splice(targetCIdx, 1)[0];
                    
                    const oldMain = structuredClone(estadoClonado);
                    oldMain.itensCorrelacionados = []; oldMain.tese = "";
                    
                    novoMestre.itensCorrelacionados = estadoClonado.itensCorrelacionados;
                    novoMestre.tese = estadoClonado.tese;
                    
                    novoMestre.itensCorrelacionados.splice(targetCIdx, 0, oldMain);
                    
                    topico.anotacoes[targetParentIndex] = novoMestre;
                } else {
                    const grupo = cardOriginal.itensCorrelacionados;
                    const [itemMovido] = grupo.splice(src.cIdx, 1);
                    grupo.splice(targetCIdx, 0, itemMovido);
                }
                break;
            }
        }

        state = newState;
        applyMiddlewares(action, oldState, newState);
        subscribers.forEach(sub => sub(state));
    }

    return { getState: () => state, dispatch, subscribe: (fn) => subscribers.push(fn) };
})();