// print-firefox-fix.js
// Forza in modo robusto il ricalcolo delle dimensioni/posizioni delle figure
// prima della stampa, compatibile con Firefox e Chrome.
// - prova prima a chiamare updateDimensions(true) su eventuali "views" globali
// - fallback: applica manipolazioni DOM mirate (width wrapper, sidebar static, graphic width)
// - pulisce tutto su afterprint

(function () {
  'use strict';

  function tryCallViewsPrinting() {
    // Prova diversi nomi comuni per l'array "views" (dipende dal bundle).
    var cand = window.views || window.kgViews || window._views || window._kg_views;
    if (cand && Array.isArray(cand)) {
      try {
        cand.forEach(function (v) {
          if (v && typeof v.updateDimensions === 'function') {
            try { v.updateDimensions(true); } catch (e) { /* ignore per singola view */ }
          }
          // se esiste sidebar, provare a posizionarla se esiste l'API
          if (v && v.sidebar && typeof v.sidebar.positionRight === 'function') {
            try { 
              // ricalcola usando lo stesso algoritmo: clientWidth-based
              var clientWidth = (v.div && v.div.node && v.div.node()) ? v.div.node().clientWidth : (document.body.clientWidth || 800);
              var width = clientWidth - 10;
              if (width <= 0) width = 600;
              var height = width / (v.aspectRatio || 1.6);
              if (width > (v.sidebar.triggerWidth || 300)) {
                var s_h = (v.explanation && v.explanation.rootElement && v.explanation.rootElement.node) ? (height + (v.explanation.rootElement.node().clientHeight || 0) + 10) : height;
                try { v.sidebar.positionRight(width, s_h); } catch(e) {}
                // update svg dims if possible
                if (v.svg) { try { v.svg.style('width', width * 77/126); v.svg.attr && v.svg.attr('width', width * 77/126); } catch(e){} }
              } else {
                try { v.sidebar.positionBelow(width, height); } catch(e){}
              }
            } catch (e) {}
          }
        });
        return true;
      } catch (e) { /* ignore and fallback */ }
    }
    return false;
  }

  // Fallback DOM-only: simile al print-figure-fix che hai testato,
  // ma chiamabile esplicitamente prima di window.print.
  var backups = [];
  function domPrepareForPrint() {
    backups.length = 0;
    // determina larghezza della colonna di testo (fallback su body)
    var contentNode = document.querySelector('.c-split-right, .content, main, article') || document.body;
    var contentWidth = Math.round(contentNode.getBoundingClientRect().width || document.body.clientWidth || 800);

    // marginnote width (se esiste)
    var marginnote = document.querySelector('.marginnote, .margin-note, .sidenote');
    var marginnoteWidth = marginnote ? Math.round(marginnote.getBoundingClientRect().width) : 0;

    // per ogni wrapper di figura prova ad applicare le stesse regole
    var wrappers = document.querySelectorAll('figure, .figure-wrapper, .kg-figure, .graph-wrapper, .graph');
    wrappers.forEach(function (fig) {
      try {
        var sidebar = fig.querySelector('.sidebar, .figure-side, .kg-sidebar, .controls');
        var graphic = fig.querySelector('svg, canvas, img, iframe, .figure-graphic, .kg-graphic, .graph-block');

        // salva backup per restore
        backups.push({ node: fig, oldStyle: fig.getAttribute('style') || '' });
        if (sidebar) backups.push({ node: sidebar, oldStyle: sidebar.getAttribute('style') || '' });
        if (graphic) backups.push({ node: graphic, oldStyle: graphic.getAttribute('style') || '' });

        // target width: se wrapper ha classe .three-horizontal-graphs, aggiungi marginnoteWidth
        var isThree = fig.closest('.three-horizontal-graphs') || fig.classList.contains('three-horizontal-graphs');
        var target = isThree ? (contentWidth + marginnoteWidth) : contentWidth;
        if (target <= 0) target = 600;

        // applica al wrapper
        fig.style.maxWidth = target + 'px';
        fig.style.width = target + 'px';
        fig.style.boxSizing = 'border-box';
        fig.style.marginLeft = '0';
        fig.style.marginRight = '0';
        fig.style.display = 'block';

        if (sidebar) {
          // neutralizza inline absolute
          sidebar.style.position = 'static';
          sidebar.style.left = '';
          sidebar.style.top = '';
          sidebar.style.right = '';
          sidebar.style.width = '';
          sidebar.style.height = '';
          sidebar.style.overflow = 'visible';
          sidebar.style.display = 'block';
          // misura sidebar attuale per calcolo grafico
          var sbRect = sidebar.getBoundingClientRect();
          var sidebarWidth = (sbRect && sbRect.width > 0) ? sbRect.width : Math.round(target * 0.32);
          sidebarWidth = Math.min(sidebarWidth, Math.round(target * 0.45));

          // force graphic width
          if (graphic) {
            var graphicWidth = Math.max(Math.round(target - sidebarWidth - 12), Math.round(target * 0.5));
            graphic.style.width = graphicWidth + 'px';
            graphic.style.maxWidth = graphicWidth + 'px';
            graphic.style.height = 'auto';
          }
        } else {
          if (graphic) {
            graphic.style.width = '100%';
            graphic.style.maxWidth = '100%';
            graphic.style.height = 'auto';
          }
        }
      } catch (e) {
        // ignore singolo fig
      }
    });
  }

  function domCleanupAfterPrint() {
    // restore backups
    for (var i = backups.length - 1; i >= 0; i--) {
      var it = backups[i];
      try {
        if (it && it.node) {
          if (it.oldStyle) it.node.setAttribute('style', it.oldStyle);
          else it.node.removeAttribute('style');
        }
      } catch (e) {}
    }
    backups.length = 0;
  }

  function beforePrint() {
    // se le view API esistono, preferiscile
    var ok = tryCallViewsPrinting();
    if (!ok) {
      domPrepareForPrint();
    }
  }
  function afterPrint() {
    // restore
    domCleanupAfterPrint();
    // if views exist, call updateDimensions(false)
    var cand = window.views || window.kgViews || window._views || window._kg_views;
    if (cand && Array.isArray(cand)) {
      cand.forEach(function (v) {
        try { if (v && typeof v.updateDimensions === 'function') v.updateDimensions(false); } catch (e) {}
      });
    }
  }

  // hook multipli: beforeprint/afterprint, matchMedia and fallback for manual call
  if (window.matchMedia) {
    var mql = window.matchMedia('print');
    mql.addListener(function (m) {
      if (m.matches) beforePrint(); else afterPrint();
    });
  }
  if ('onbeforeprint' in window) window.onbeforeprint = beforePrint;
  if ('onafterprint' in window) window.onafterprint = afterPrint;

  // espongo una funzione utile per debug/manual trigger da console o dal bottone print
  window.__triggerPrintAdjustments = function () {
    beforePrint();
  };

})();
