/* ================================================
   store.js
   Gerenciamento de Estado Centralizado (Redux-Pattern)
   Prepara a base para remoção das mutações do array global.
   ================================================ */
window.Store = (function() {
    'use strict';
    
    let state = { topicos: [], activeTabId: null };
    const subscribers = [];
    let isBatching = false; // Controle anti-layout-thrashing

    // Utilitário de Imutabilidade Segura (Modo Estrito)
    const deepFreeze = obj => {
        if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
            Object.keys(obj).forEach(prop => deepFreeze(obj[prop]));
            Object.freeze(obj);
        }
        return obj;
    };

    function notifySubscribers() {
        if (!isBatching) {
            isBatching = true;
            // Microtask queue: garante que múltiplos dispatches síncronos disparem apenas 1 render
            Promise.resolve().then(() => {
                const frozenState = deepFreeze(state);
                subscribers.forEach(fn => fn(frozenState));
                isBatching = false;
                
                // Side-effects (Auto-Save) processados após a renderização
                if (window.salvarBackupAutomatico) window.salvarBackupAutomatico();
                if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
            });
        }
    }

    function dispatch(action) {
        // SHALLOW COPY: Alta performance. Copiamos o root, preservando referências internas
        let newState = { ...state };
        if (state.topicos) newState.topicos = [...state.topicos];

        switch (action.type) {
            case 'LOAD_BACKUP':
                newState.topicos = action.payload;
                break;
                
            case 'SET_TAB':
                newState.activeTabId = action.payload;
                break;
                
            case 'DELETE_ITEM': {
                const { topicoId, index } = action.payload;
                newState.topicos = newState.topicos.map(t => {
                    if (t.id !== topicoId) return t;
                    const newAnots = [...t.anotacoes];
                    newAnots.splice(index, 1);
                    return { ...t, anotacoes: newAnots };
                });
                break;
            }
                
            case 'UPDATE_TOPIC_PREAMBLE': {
                const { topicoId, campo, novoTexto } = action.payload;
                newState.topicos = newState.topicos.map(t => 
                    t.id === topicoId ? { ...t, [campo]: novoTexto } : t
                );
                break;
            }

            case 'UPDATE_MAIN_ANNOTATION': {
                const { topicoId, parentIndex, novoTexto } = action.payload;
                newState.topicos = newState.topicos.map(t => {
                    if (t.id !== topicoId) return t;
                    const newAnots = [...t.anotacoes];
                    newAnots[parentIndex] = { ...newAnots[parentIndex], conteudo: novoTexto };
                    return { ...t, anotacoes: newAnots };
                });
                break;
            }

            case 'UPDATE_SUB_ANNOTATION': {
                const { topicoId, parentIndex, viewSource, localIndex, novoTexto } = action.payload;
                newState.topicos = newState.topicos.map(t => {
                    if (t.id !== topicoId) return t;
                    const newAnots = [...t.anotacoes];
                    const an = { ...newAnots[parentIndex] };
                    
                    if (viewSource === 'main') {
                        const newSubs = [...(an.subAnotacoes || [])];
                        newSubs[localIndex] = { ...newSubs[localIndex], texto: novoTexto };
                        an.subAnotacoes = newSubs;
                    } else {
                        const cIdx = parseInt(viewSource, 10);
                        const newCorrs = [...(an.itensCorrelacionados || [])];
                        const corr = { ...newCorrs[cIdx] };
                        const newSubs = [...(corr.subAnotacoes || [])];
                        newSubs[localIndex] = { ...newSubs[localIndex], texto: novoTexto };
                        corr.subAnotacoes = newSubs;
                        newCorrs[cIdx] = corr;
                        an.itensCorrelacionados = newCorrs;
                    }
                    newAnots[parentIndex] = an;
                    return { ...t, anotacoes: newAnots };
                });
                break;
            }

            case 'UPDATE_CORRELATED_ITEM': {
                const { topicoId, parentIndex, cIdx, novoTexto } = action.payload;
                newState.topicos = newState.topicos.map(t => {
                    if (t.id !== topicoId) return t;
                    const newAnots = [...t.anotacoes];
                    const an = { ...newAnots[parentIndex] };
                    const newCorrs = [...(an.itensCorrelacionados || [])];
                    newCorrs[cIdx] = { ...newCorrs[cIdx], conteudo: novoTexto };
                    an.itensCorrelacionados = newCorrs;
                    newAnots[parentIndex] = an;
                    return { ...t, anotacoes: newAnots };
                });
                break;
            }
        }

        state = newState;
        notifySubscribers();
    }

    return { 
        getState: () => deepFreeze(state), 
        dispatch, 
        subscribe: (fn) => subscribers.push(fn) 
    };
})();
