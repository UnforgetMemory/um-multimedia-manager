import { Utils } from '@/utils'

export function makeBadge(status: number, rating: number, inline = false): string {
  const isDone = status === 2
  const text = isDone ? (rating > 0 ? Utils.formatRating10(rating) : '✓') : '○'
  const cls = isDone ? 'umm-badge--done' : 'umm-badge--none'
  if (inline) {
    return `<span class="umm-badge umm-badge--inline ${cls}">${text}</span>`
  }
  return `<span class="umm-badge ${cls}">${text}</span>`
}

export function injectGlobalStyles(): void {
  if (document.getElementById('umm-homepage-styles')) return
  const style = document.createElement('style')
  style.id = 'umm-homepage-styles'
  style.textContent = `
.umm-top-panel{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:block;width:100%;max-width:100vw;box-sizing:border-box;padding:16px 0;background:#fff;position:relative;z-index:9999;overflow:visible;}
.umm-section{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:block;width:100%;box-sizing:border-box;margin-bottom:24px;padding:0;}
.umm-section-hd{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:space-between;padding:0 16px 8px;border-bottom:1px solid #e5e7eb;margin-bottom:8px;}
.umm-section-hd h2{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:18px;font-weight:600;color:#1a1a1a;margin:0;}
.umm-scroll-wrap{all:initial;position:relative;width:100%;box-sizing:border-box;overflow:visible;}
.umm-scroll-track{all:initial;display:flex;flex-wrap:nowrap;gap:12px;padding:8px 40px;overflow-x:auto;scroll-behavior:smooth;scrollbar-width:thin;scrollbar-color:#c4c4c4 #f0f0f0;box-sizing:border-box;width:100%;}
.umm-scroll-track::-webkit-scrollbar{height:6px;}
.umm-scroll-track::-webkit-scrollbar-track{background:#f0f0f0;border-radius:3px;}
.umm-scroll-track::-webkit-scrollbar-thumb{background:#c4c4c4;border-radius:3px;}
.umm-scroll-track::-webkit-scrollbar-thumb:hover{background:#a0a0a0;}
.umm-mask{all:initial;position:absolute;top:0;width:40px;height:100%;pointer-events:none;z-index:5;}
.umm-mask--left{left:0;background:linear-gradient(to right,#fff,transparent);}
.umm-mask--right{right:0;background:linear-gradient(to left,#fff,transparent);}
.umm-item-reset{all:initial;display:block;width:auto;height:auto;overflow:visible;flex-shrink:0;}
.umm-item-inner{all:initial;display:flex;flex-direction:column;margin:0;padding:0;list-style:none;}
.umm-card{all:initial !important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif !important;box-sizing:border-box !important;display:flex !important;flex-direction:column !important;width:140px !important;min-width:140px !important;position:relative !important;cursor:pointer !important;text-decoration:none !important;color:inherit !important;background:transparent !important;border:none !important;outline:none !important;transition:transform .3s cubic-bezier(.4,0,.2,1),box-shadow .3s cubic-bezier(.4,0,.2,1) !important;}
.umm-card:link,.umm-card:visited,.umm-card:hover,.umm-card:active{color:inherit !important;text-decoration:none !important;background:transparent !important;outline:none !important;border:none !important;}
.umm-card:hover{transform:translateY(-6px) scale(1.02);box-shadow:0 12px 28px rgba(0,0,0,.15),0 4px 10px rgba(0,0,0,.08);}
.umm-card:active{transform:translateY(-2px) scale(1.0);transition:transform .1s ease;}
.umm-card-cover{all:initial;position:relative;width:140px;height:196px;border-radius:6px;overflow:hidden;flex-shrink:0;background:#f0f0f0;transition:box-shadow .3s cubic-bezier(.4,0,.2,1);}
.umm-card:hover .umm-card-cover{box-shadow:0 4px 16px rgba(0,0,0,.12);}
.umm-card-img{all:initial;display:block;width:100%;height:100%;object-fit:cover;border-radius:6px;transition:transform .4s cubic-bezier(.25,.46,.45,.94),filter .3s ease;}
.umm-card:hover .umm-card-img{transform:scale(1.08);filter:brightness(1.05);}
.umm-card-title{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:block;margin-top:6px;font-size:13px;font-weight:500;line-height:1.3;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;transition:color .2s ease;}
.umm-card:hover .umm-card-title{color:#111;}
.umm-card-rating{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;gap:4px;margin-top:3px;font-size:12px;color:#999;transition:color .2s ease;}
.umm-card:hover .umm-card-rating{color:#666;}
.umm-card-star{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:inline-block;color:#ffa500;font-size:12px;letter-spacing:-1px;transition:transform .3s ease,filter .3s ease;}
.umm-card:hover .umm-card-star{transform:scale(1.15);filter:drop-shadow(0 1px 3px rgba(255,165,0,.4));}
.umm-card-no-rating{color:#ccc;font-size:11px;}
.umm-badge{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;font-weight:700;line-height:1;transition:all .25s cubic-bezier(.4,0,.2,1);}
.umm-badge--inline{min-width:40px;height:18px;padding:0 6px;font-size:10px;margin-top:4px;}
.umm-badge--inline.umm-badge--done{background:linear-gradient(180deg,rgba(17,111,70,.96),rgba(11,83,53,.98));color:#f4fff8;border:1px solid rgba(198,255,228,.26);}
.umm-badge--inline.umm-badge--none{background:linear-gradient(180deg,rgba(164,43,60,.96),rgba(126,28,48,.98));color:#fff7f8;border:1px solid rgba(255,214,220,.22);}
.umm-card:hover .umm-badge--inline{transform:scale(1.05);}
.umm-badge:not(.umm-badge--inline){min-width:22px;height:22px;padding:0 6px;border-radius:11px;font-size:11px;z-index:10;box-shadow:0 1px 3px rgba(0,0,0,.25);}
.umm-badge:not(.umm-badge--inline).umm-badge--done{background:linear-gradient(180deg,rgba(17,111,70,.96),rgba(11,83,53,.98));color:#f4fff8;border:1px solid rgba(198,255,228,.26);}
.umm-badge:not(.umm-badge--inline).umm-badge--none{background:linear-gradient(180deg,rgba(164,43,60,.96),rgba(126,28,48,.98));color:#fff7f8;border:1px solid rgba(255,214,220,.22);}
.umm-badge--small{display:inline-flex;align-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;font-size:10px;font-weight:700;margin-left:6px;vertical-align:middle;}
.umm-badge--small.umm-badge--done{background:linear-gradient(180deg,rgba(17,111,70,.96),rgba(11,83,53,.98));color:#f4fff8;border:1px solid rgba(198,255,228,.26);}
.umm-badge--small.umm-badge--none{background:linear-gradient(180deg,rgba(164,43,60,.96),rgba(126,28,48,.98));color:#fff7f8;border:1px solid rgba(255,214,220,.22);}
.umm-billboard-card{all:initial !important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif !important;display:inline-flex !important;align-items:center !important;gap:8px !important;padding:6px 12px !important;border-radius:8px !important;text-decoration:none !important;color:#333 !important;background:#f8f8f8 !important;flex-shrink:0 !important;white-space:nowrap !important;border:1px solid #eee !important;box-sizing:border-box !important;transition:all .3s cubic-bezier(.4,0,.2,1) !important;}
.umm-billboard-card:link,.umm-billboard-card:visited,.umm-billboard-card:hover,.umm-billboard-card:active{color:#333 !important;text-decoration:none !important;background:inherit !important;outline:none !important;border-color:inherit !important;}
.umm-billboard-card:hover{background:#fff;border-color:#d0d0d0;box-shadow:0 4px 12px rgba(0,0,0,.08);transform:translateY(-2px);}
.umm-billboard-card:active{transform:translateY(0);transition:transform .1s ease;}
.umm-billboard-order{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:700;color:#999;font-size:12px;min-width:16px;text-align:center;transition:color .2s ease;}
.umm-billboard-card:hover .umm-billboard-order{color:#666;}
.umm-billboard-title{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#333;transition:color .2s ease;}
.umm-billboard-card:hover .umm-billboard-title{color:#111;}
.umm-hot-card{all:initial;flex-shrink:0;}
.umm-episodes{all:initial;position:absolute;bottom:4px;left:4px;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;color:#fff;background:rgba(0,0,0,.6);}
.umm-search-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;margin-left:8px;font-size:12px;font-weight:600;border-radius:12px;background:linear-gradient(180deg,#1757d6 0%,#0d47b8 100%);color:#fff;box-shadow:0 2px 4px rgba(13,71,184,.3);transition:all .2s ease;cursor:default;user-select:none;}
.umm-search-badge[data-status="done"]{background:linear-gradient(180deg,rgba(17,111,70,.96),rgba(11,83,53,.98));box-shadow:0 2px 4px rgba(11,101,54,.3);}
.umm-search-badge[data-status="none"]{background:linear-gradient(180deg,rgba(164,43,60,.96),rgba(126,28,48,.98));box-shadow:0 2px 4px rgba(126,28,48,.3);}
.umm-search-badge:hover{transform:translateY(-1px);box-shadow:0 4px 8px rgba(0,0,0,.2);}
`
  document.head.appendChild(style)
}
