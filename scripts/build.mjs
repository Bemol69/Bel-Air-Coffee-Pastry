// Arma la web para publicar. Vercel lo ejecuta en cada cambio (ver vercel.json).
//  1. Lee tienda.config.json (lo define el desarrollador) y data/ (lo edita el cliente en /admin)
//  2. Junta productos, categorías y sucursales en data/catalogo.json
//  3. Copia el sitio a dist/ reemplazando los %%MARCADORES%% y los bloques <!-- RENDER:X -->
//     (la carta, las sucursales y las reseñas quedan escritas en el HTML, así Google las lee)
//     y genera canonical, Open Graph, datos estructurados, robots.txt y sitemap.xml
// Uso local: node scripts/build.mjs  →  servir la carpeta dist/
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const config = readJson(join(ROOT, 'tienda.config.json'));
const ajustes = existsSync(join(DATA, 'ajustes.json')) ? readJson(join(DATA, 'ajustes.json')) : {};

// En Vercel se usa el dominio de producción (se actualiza solo al conectar un dominio propio)
const SITE = (process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : config.site_url || 'http://localhost:5600').replace(/\/$/, '');

// ---------- 1. Datos del negocio ----------
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clp = (n) => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const rel = (p) => str(p).replace(/^\//, '');
const abs = (p) => `${SITE}/${rel(p)}`;
const num = (v, def) => (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : def);
const HORA = /^\d{2}:\d{2}$/;

const T = {
  nombre: str(config.nombre),
  rubro: str(config.rubro),
  schema_tipo: str(config.schema_tipo) || 'CafeOrCoffeeShop',
  whatsapp: str(ajustes.whatsapp).replace(/\D/g, ''),
  instagram: str(ajustes.instagram).replace(/^@/, ''),
  tiktok: str(ajustes.tiktok).replace(/^@/, ''),
  email: str(ajustes.email),
  ciudad: str(ajustes.ciudad) || 'Santiago',
  region: str(ajustes.region),
};

if (!T.nombre) throw new Error('Falta "nombre" en tienda.config.json');
// En una cafetería el WhatsApp es opcional (los encargos pueden llegar por Instagram)
if (T.whatsapp && (!/^\d{10,15}$/.test(T.whatsapp) || (T.whatsapp.startsWith('56') && !/^569\d{8}$/.test(T.whatsapp)))) {
  throw new Error(`WhatsApp inválido "${T.whatsapp}": usa formato internacional; en Chile son 11 dígitos, ej 56912345678`);
}

// ---------- 2. Carta y sucursales ----------
function readFolder(folder) {
  const dir = join(DATA, folder);
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const items = [];
  for (const file of files) {
    try {
      items.push({ id: basename(file, '.json'), ...readJson(join(dir, file)) });
    } catch (e) {
      // Un archivo dañado no debe botar toda la web: se omite y se avisa en el log
      console.warn(`⚠️  Se omitió ${folder}/${file}: ${e.message}`);
    }
  }
  return items;
}

const byOrder = (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es');
const visibles = (items) => items.filter((x) => x.visible !== false && typeof x.nombre === 'string' && x.nombre.trim());

const productos = visibles(readFolder('productos'))
  .map((p) => ({
    id: p.id,
    nombre: p.nombre.trim(),
    precio: Math.max(0, Math.round(num(p.precio, 0))),
    foto: rel(p.foto) || 'img/logo.jpg',
    descripcion: str(p.descripcion),
    etiqueta: str(p.etiqueta),
    agotado: p.agotado === true,
    orden: num(p.orden, 1000),
  }))
  .sort(byOrder)
  .map(({ orden, ...p }) => p);

const porId = new Map(productos.map((p) => [p.id, p]));

const categorias = visibles(readFolder('categorias'))
  .map((c) => ({
    id: c.id,
    nombre: c.nombre.trim(),
    bajada: str(c.bajada),
    orden: num(c.orden, 1000),
    // se descartan productos borrados u ocultos, y repetidos
    productos: [...new Set(Array.isArray(c.productos) ? c.productos : [])].filter((id) => porId.has(id)),
  }))
  .filter((c) => c.productos.length)
  .sort(byOrder)
  .map(({ orden, ...c }) => c);

const sucursales = visibles(readFolder('sucursales'))
  .map((s) => ({
    id: s.id,
    nombre: s.nombre.trim(),
    comuna: str(s.comuna) || T.ciudad,
    direccion: str(s.direccion),
    referencia: str(s.referencia),
    foto: rel(s.foto) || 'img/logo.jpg',
    foto_2: rel(s.foto_2),
    maps_url: str(s.maps_url) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${T.nombre} ${s.direccion} ${s.comuna || T.ciudad}`)}`,
    etiqueta: str(s.etiqueta),
    horario: (Array.isArray(s.horario) ? s.horario : [])
      .map((h) => ({ dias: str(h.dias), abre: str(h.abre), cierra: str(h.cierra) }))
      .filter((h) => {
        if (h.dias && HORA.test(h.abre) && HORA.test(h.cierra)) return true;
        console.warn(`⚠️  Horario omitido en sucursal ${s.id}: ${JSON.stringify(h)} (usa HH:MM)`);
        return false;
      }),
    orden: num(s.orden, 1000),
  }))
  .sort(byOrder)
  .map(({ orden, ...s }) => s);

writeFileSync(join(DATA, 'catalogo.json'), JSON.stringify({
  _aviso: 'Archivo generado por scripts/build.mjs. No editar a mano.',
  categorias, productos, sucursales,
}, null, 2) + '\n');
console.log(`✅ carta: ${productos.length} productos en ${categorias.length} categorías · ${sucursales.length} sucursales`);

// ---------- 3. Bloques renderizados ----------
const waLink = (texto) => `https://api.whatsapp.com/send?phone=${T.whatsapp}&text=${encodeURIComponent(texto)}`;
const igDm = T.instagram ? `https://ig.me/m/${T.instagram}` : '';
const encargoLink = T.whatsapp
  ? waLink('Hola Bel Air! 🩵 Quiero encargar una torta 🎂\n\n📅 *Fecha:* \n👥 *Personas:* \n🍰 *Sabor o idea:* ')
  : igDm || (T.email ? `mailto:${T.email}` : '#sucursales');
const encargoTexto = T.whatsapp ? 'Encargar por WhatsApp' : T.instagram ? 'Escríbenos por Instagram' : 'Visítanos';

const dia = {
  // cómo se interpreta "días" para el estado "Abierto ahora" (0 = domingo)
  'lunes a viernes': [1, 2, 3, 4, 5], 'lunes a sábado': [1, 2, 3, 4, 5, 6], 'lunes a domingo': [0, 1, 2, 3, 4, 5, 6],
  'todos los días': [0, 1, 2, 3, 4, 5, 6], 'sábados': [6], 'sábado': [6], 'domingos': [0], 'domingo': [0],
  'domingos y festivos': [0], 'sábados, domingos y festivos': [0, 6], 'fines de semana': [0, 6],
};
const diasDe = (txt) => dia[txt.toLowerCase()] || [];

const card = (p, i) => `
          <article class="dish" style="--i:${i}">
            <div class="dish__img">
              ${p.agotado ? '<span class="dish__tag dish__tag--off">Agotado hoy</span>' : p.etiqueta ? `<span class="dish__tag">${esc(p.etiqueta)}</span>` : ''}
              <img src="${esc(p.foto)}" alt="${esc(p.nombre)}" loading="lazy" decoding="async" width="600" height="750">
            </div>
            <div class="dish__body">
              <h4>${esc(p.nombre)}</h4>
              ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ''}
              ${p.precio ? `<span class="dish__price">${clp(p.precio)}</span>` : ''}
            </div>
          </article>`;

const CARTA = `
      <div class="tabs" role="tablist" aria-label="Categorías de la carta">
        <span class="tabs__pill" aria-hidden="true"></span>
        ${categorias.map((c, i) => `<button class="tabs__btn" role="tab" id="tab-${esc(c.id)}" aria-controls="panel-${esc(c.id)}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(c.nombre)}<sup>${c.productos.length}</sup></button>`).join('\n        ')}
      </div>
      ${categorias.map((c, i) => `
      <div class="menu-panel" role="tabpanel" id="panel-${esc(c.id)}" aria-labelledby="tab-${esc(c.id)}"${i === 0 ? '' : ' hidden'}>
        <div class="menu-panel__head">
          <h3 class="menu-panel__title">${esc(c.nombre)}${c.bajada ? ` <em>${esc(c.bajada)}</em>` : ''}</h3>
          <div class="rail-nav">
            <button class="rail-btn" data-dir="-1" aria-label="Anteriores"><svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></button>
            <button class="rail-btn" data-dir="1" aria-label="Siguientes"><svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></button>
          </div>
        </div>
        <div class="dishes" tabindex="0" aria-label="${esc(c.nombre)}: desliza para ver más">${c.productos.map((id, j) => card(porId.get(id), j)).join('')}
        </div>
      </div>`).join('')}`;

const SUCURSALES = sucursales.map((s, i) => `
      <article class="place" data-reveal data-horario="${esc(JSON.stringify(s.horario.map((h) => ({ d: diasDe(h.dias), a: h.abre, c: h.cierra }))))}">
        <a class="place__media" href="${esc(s.maps_url)}" target="_blank" rel="noopener" aria-label="Cómo llegar a ${esc(s.nombre)}">
          <img src="${esc(s.foto)}" alt="Bel Air ${esc(s.nombre)}" loading="lazy" decoding="async">
          ${s.foto_2 ? `<img class="place__alt" src="${esc(s.foto_2)}" alt="" loading="lazy" decoding="async">` : ''}
          ${s.etiqueta ? `<span class="place__tag">${esc(s.etiqueta)}</span>` : ''}
          <span class="place__num">0${i + 1}</span>
        </a>
        <div class="place__body">
          <p class="place__status" aria-live="polite"><span class="dot"></span><span class="place__status-text">Horario</span></p>
          <h3>${esc(s.nombre)}</h3>
          <p class="place__addr">${esc(s.direccion)}${s.comuna ? `, ${esc(s.comuna)}` : ''}</p>
          ${s.referencia ? `<p class="place__ref">${esc(s.referencia)}</p>` : ''}
          <dl class="hours">${s.horario.map((h) => `<div><dt>${esc(h.dias)}</dt><dd>${esc(h.abre)} – ${esc(h.cierra)}</dd></div>`).join('')}</dl>
          <a class="btn btn--line" href="${esc(s.maps_url)}" target="_blank" rel="noopener">Cómo llegar <svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></a>
        </div>
      </article>`).join('');

const resenas = (Array.isArray(ajustes.resenas) ? ajustes.resenas : []).filter((r) => str(r.texto));
const RESENAS = resenas.map((r, i) => `
        <figure class="quote" style="--i:${i}">
          <svg class="quote__mark" aria-hidden="true"><use href="#i-quote"/></svg>
          <blockquote>${esc(r.texto)}</blockquote>
          <figcaption><strong>${esc(r.autor)}</strong>${r.sucursal ? ` · ${esc(r.sucursal)}` : ''}</figcaption>
        </figure>`).join('');

const galeria = (Array.isArray(ajustes.galeria) ? ajustes.galeria : []).map(rel).filter(Boolean);
const GALERIA = [0, 1, 2, 3].map((col) => `
        <div class="gallery__col" data-speed="${[-40, 30, -60, 20][col]}">${galeria.filter((_, i) => i % 4 === col).map((g) => `
          <a href="https://www.instagram.com/${esc(T.instagram)}/" target="_blank" rel="noopener" class="gallery__item"><img src="${esc(g)}" alt="Foto de Bel Air en Instagram" loading="lazy" decoding="async"></a>`).join('')}
        </div>`).join('');

// El manifiesto se parte en palabras (se van "pintando" al hacer scroll) con dos fotos redondas intercaladas
const palabras = str(ajustes.manifiesto).split(/\s+/).filter(Boolean);
const pills = ['img/productos/cappuccino.webp', 'img/lugar/perro-cliente.webp'];
const MANIFIESTO = palabras.map((w, i) => {
  const pill = i === Math.floor(palabras.length / 3) ? 0 : i === Math.floor((palabras.length * 2) / 3) ? 1 : -1;
  return `${pill >= 0 ? `<span class="pill" aria-hidden="true"><img src="${pills[pill]}" alt="" loading="lazy"></span> ` : ''}<span class="w">${esc(w)}</span>`;
}).join(' ');

const MARQUESINA = productos.slice(0, 14).map((p) => `<span>${esc(p.nombre)}</span><svg class="bean" aria-hidden="true"><use href="#i-bean"/></svg>`).join('');

// ---------- 4. Marcadores %%CLAVE%% ----------
const colores = config.colores || {};
const fuentes = config.fuentes || {};
const FUENTE_TITULOS = fuentes.titulos || 'Fraunces';
const FUENTE_TEXTO = fuentes.texto || 'Manrope';
const SEO_TITULO = str(config.seo_titulo) || `${T.nombre} · ${T.rubro} en ${T.ciudad}`;
const SEO_DESCRIPCION = str(config.seo_descripcion) || str(ajustes.hero_bajada);
const OG_IMAGE = abs(config.og_imagen || 'img/logo.jpg');

const VARS = {
  NOMBRE: T.nombre, RUBRO: T.rubro, CIUDAD: T.ciudad,
  SEO_TITULO, SEO_DESCRIPCION,
  INSTAGRAM: T.instagram, TIKTOK: T.tiktok, EMAIL: T.email, WHATSAPP: T.whatsapp,
  HERO_TITULO: str(ajustes.hero_titulo), HERO_DESTACADO: str(ajustes.hero_destacado), HERO_BAJADA: str(ajustes.hero_bajada),
  TORTAS_TITULO: str(ajustes.tortas_titulo), TORTAS_TEXTO: str(ajustes.tortas_texto),
  PET_TITULO: str(ajustes.pet_titulo), PET_TEXTO: str(ajustes.pet_texto),
  RATING: str(ajustes.rating), RATING_TOTAL: str(ajustes.rating_total),
  ENCARGO_LINK: encargoLink, ENCARGO_TEXTO: encargoTexto,
  SUCURSAL_1: sucursales[0] ? sucursales[0].direccion : '',
  ANIO: String(new Date().getFullYear()),
  FUENTES_URL: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(FUENTE_TITULOS).replace(/%20/g, '+')}:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&family=${encodeURIComponent(FUENTE_TEXTO).replace(/%20/g, '+')}:wght@400..700&display=swap`,
  FUENTE_TITULOS, FUENTE_TEXTO,
  GITHUB_REPO: str(config.github_repo), SITE_URL: `${SITE}/`,
};
for (const [k, v] of Object.entries(colores)) VARS[`COLOR_${k.toUpperCase()}`] = v;

// Bloques opcionales: <!-- SI:CLAVE --> ... <!-- /SI:CLAVE --> se eliminan si CLAVE está vacía
function render(text, file, escape) {
  let out = text.replace(/<!-- SI:([A-Z0-9_]+) -->([\s\S]*?)<!-- \/SI:\1 -->/g, (m, key, body) => (str(VARS[key]) ? body : ''));
  const missing = new Set();
  out = out.replace(/%%([A-Z0-9_]+)%%/g, (m, key) => {
    const v = VARS[key];
    if (v === undefined || v === null || (v === '' && key.startsWith('COLOR_'))) { missing.add(key); return m; }
    return escape ? esc(v) : String(v);
  });
  if (missing.size) throw new Error(`${file}: faltan valores para ${[...missing].join(', ')}`);
  return out;
}

// ---------- 5. SEO ----------
const sameAs = [
  T.instagram && `https://www.instagram.com/${T.instagram}/`,
  T.tiktok && `https://www.tiktok.com/@${T.tiktok}`,
].filter(Boolean);
const DIAS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#marca`,
      name: T.nombre,
      url: `${SITE}/`,
      logo: abs('img/logo.jpg'),
      sameAs: sameAs.length ? sameAs : undefined,
    },
    ...sucursales.map((s) => ({
      '@type': T.schema_tipo,
      '@id': `${SITE}/#${s.id}`,
      name: `${T.nombre} · ${s.nombre}`,
      parentOrganization: { '@id': `${SITE}/#marca` },
      description: SEO_DESCRIPCION,
      url: `${SITE}/`,
      image: [abs(s.foto), OG_IMAGE],
      telephone: T.whatsapp ? `+${T.whatsapp}` : undefined,
      servesCuisine: ['Café de especialidad', 'Pastelería'],
      priceRange: '$$',
      currenciesAccepted: 'CLP',
      hasMap: s.maps_url,
      address: {
        '@type': 'PostalAddress',
        streetAddress: s.direccion || undefined,
        addressLocality: s.comuna,
        addressRegion: T.region || undefined,
        addressCountry: 'CL',
      },
      openingHoursSpecification: s.horario
        .filter((h) => diasDe(h.dias).length)
        .map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: diasDe(h.dias).map((d) => DIAS_EN[d]), opens: h.abre, closes: h.cierra })),
      hasMenu: {
        '@type': 'Menu',
        hasMenuSection: categorias.map((c) => ({
          '@type': 'MenuSection',
          name: c.nombre,
          hasMenuItem: c.productos.map((id) => {
            const p = porId.get(id);
            return {
              '@type': 'MenuItem', name: p.nombre, description: p.descripcion || undefined, image: abs(p.foto),
              offers: p.precio ? { '@type': 'Offer', price: p.precio, priceCurrency: 'CLP' } : undefined,
            };
          }),
        })),
      },
    })),
  ],
};

const head = `<link rel="canonical" href="${SITE}/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(T.nombre)}">
  <meta property="og:locale" content="es_CL">
  <meta property="og:url" content="${SITE}/">
  <meta property="og:title" content="${esc(SEO_TITULO)}">
  <meta property="og:description" content="${esc(SEO_DESCRIPCION)}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta name="twitter:card" content="summary_large_image">${config.google_verificacion
    ? `\n  <meta name="google-site-verification" content="${esc(config.google_verificacion)}">` : ''}
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;

// ---------- 6. dist/ ----------
// Pie de página: direcciones y horario salen de las sucursales (el horario, de la primera)
const FOOTER_DIRECCIONES = sucursales.map((s) => `<p><a href="${esc(s.maps_url)}" target="_blank" rel="noopener">${esc(s.nombre)} · ${esc(s.direccion)}</a></p>`).join('\n        ');
const FOOTER_HORARIO = (sucursales[0] ? sucursales[0].horario : []).map((h) => `<p>${esc(h.dias)} · ${esc(h.abre)} – ${esc(h.cierra)}</p>`).join('\n        ');
const BLOQUES = { CARTA, SUCURSALES, RESENAS, GALERIA, MANIFIESTO, MARQUESINA, FOOTER_DIRECCIONES, FOOTER_HORARIO };
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const marker of ['<!-- SEO:HEAD', ...Object.keys(BLOQUES).map((k) => `<!-- RENDER:${k} -->`)]) {
  if (!html.includes(marker)) throw new Error(`Falta el marcador ${marker} en index.html`);
}
html = render(html, 'index.html', true).replace(/<!-- SEO:HEAD[^>]*-->/, head);
for (const [k, v] of Object.entries(BLOQUES)) html = html.split(`<!-- RENDER:${k} -->`).join(v);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'data'), { recursive: true });
cpSync(join(ROOT, 'img'), join(DIST, 'img'), { recursive: true });
cpSync(join(ROOT, 'admin'), join(DIST, 'admin'), { recursive: true });
cpSync(join(DATA, 'catalogo.json'), join(DIST, 'data', 'catalogo.json'));
writeFileSync(join(DIST, 'index.html'), html);
writeFileSync(join(DIST, 'styles.css'), render(readFileSync(join(ROOT, 'styles.css'), 'utf8'), 'styles.css', false));
writeFileSync(join(DIST, 'app.js'), readFileSync(join(ROOT, 'app.js'), 'utf8'));
writeFileSync(join(DIST, 'admin', 'config.yml'), render(readFileSync(join(ROOT, 'admin', 'config.yml'), 'utf8'), 'admin/config.yml', false));

writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>
</urlset>
`);

if (!existsSync(join(ROOT, 'img', 'logo.jpg'))) console.warn('⚠️  Falta img/logo.jpg (logo de la tienda)');
console.log(`✅ sitio listo en dist/ para ${SITE}`);
