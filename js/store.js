/* ================================================
   store.js
   Gerenciamento de Estado Centralizado (Redux-Pattern)
   Reatividade Fina (V4 - Side-Effects Delegados)
   ================================================ */
window.Store = (function() {
    'use strict';
    
    let state = { topicos: [], activeTabId: null };
    const globalSubscribers = [];
    const granularSubscribers = new Map();
    let isBatching = false;

    const deepFreeze = obj => {
        if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
            Object.keys(obj).forEach(prop => deepFreeze(obj[prop]));
            Object.freeze(obj);
        }
        return obj;
    };

    function subscribeAction(actionType, callback) {
        if (!granularSubscribers.has(actionType)) {
            granularSubscribers.set(actionType, new Set());
        }
        granularSubscribers.get(actionType).add(callback);
        
        return function unsubscribe() {
            granularSubscribers.get(actionType).delete(callback);
        };
    }

    function clearGranularSubscriptions() {
        granularSubscribers.clear();
    }

    function forceGlobalNotify() {
        if (!isBatching) {
            isBatching = true;
            Promise.resolve().then(() => {
                const frozenState = deepFreeze(state);
                globalSubscribers.forEach(fn => fn(frozenState));
                isBatching = false;
                
                // Side-effects centrais são exclusividade da notificação global
                if (window.salvarBackupAutomatico) window.salvarBackupAutomatico();
                if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
            });
        }
    }

    function dispatch(action) {
        let newState = { ...state };
        if (state.topicos) newState.topicos = [...state.topicos];

        let targetNodeInfo = null;

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
                targetNodeInfo = { type: 'preamble', topicoId, campo, texto: novoTexto };
                break;
            }

            case 'UPDATE_MAIN_ANNOTATION': {
                const { topicoId, parentIndex, novoTexto, uuid } = action.payload;
                newState.topicos = newState.topicos.map(t => {
                    if (t.id !== topicoId) return t;
                    const newAnots = [...t.anotacoes];
                    newAnots[parentIndex] = { ...newAnots[parentIndex], conteudo: novoTexto };
                    return { ...t, anotacoes: newAnots };
                });
                targetNodeInfo = { type: 'main-card', uuid, texto: novoTexto };
                break;
            }

            case 'UPDATE_SUB_ANNOTATION': {
                const { topicoId, parentIndex, viewSource, localIndex, novoTexto, uuid } = action.payload;
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
                targetNodeInfo = { type: 'sub-card', uuid, texto: novoTexto };
                break;
            }

            case 'UPDATE_CORRELATED_ITEM': {
                const { topicoId, parentIndex, cIdx, novoTexto, uuid } = action.payload;
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
                targetNodeInfo = { type: 'correlated-card', uuid, texto: novoTexto };
                break;
            }
        }

        state = newState;

        // O Dispatcher agora apenas NOTIFICA, sem executar side-effects.
        if (targetNodeInfo && granularSubscribers.has(action.type) && granularSubscribers.get(action.type).size > 0) {
            granularSubscribers.get(action.type).forEach(fn => fn(targetNodeInfo));
        } else {
            forceGlobalNotify();
        }
    }

    return { 
        getState: () => deepFreeze(state), 
        dispatch, 
        subscribe: (fn) => globalSubscribers.push(fn),
        subscribeAction,
        clearGranularSubscriptions,
        forceGlobalNotify
    };
})();
