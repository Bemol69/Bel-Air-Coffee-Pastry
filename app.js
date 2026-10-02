// Bel Air Coffee & Pastry — interacciones y animaciones.
// Todo el contenido ya viene escrito en el HTML (build.mjs); este archivo solo le da movimiento.
// Si GSAP o Lenis no cargan (sin internet / bloqueados), la página funciona igual con la versión simple.
(() => {
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  if (!reduce) root.classList.add('anim');

  // ---------- Palabras que aparecen (desenfoque → nítido) ----------
  $$('[data-split]').forEach((el) => {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            const s = document.createElement('span');
            s.className = 'split-w';
            s.style.setProperty('--wi', i++);
            s.textContent = part;
            frag.append(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
  });

  // ---------- Aparición al entrar en pantalla ----------
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  const observeReveals = () => $$('[data-reveal], [data-split]:not(.hero__title), .pet__card, .menu-panel:not([hidden])').forEach((el) => io.observe(el));

  // Retraso escalonado para elementos hermanos con data-reveal
  $$('[data-reveal]').forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
    const idx = sibs.indexOf(el);
    if (idx > 0) el.style.setProperty('--d', `${idx * 0.12}s`);
  });

  const startHero = () => {
    $('.hero__title').classList.add('is-in');
    $$('[data-hero-fade]').forEach((el, i) => {
      el.style.setProperty('--d', `${0.25 + i * 0.15}s`);
      el.classList.add('is-in');
    });
    observeReveals();
  };

  // ---------- Intro ----------
  const intro = $('.intro');
  let seen = false;
  try { seen = sessionStorage.getItem('belair-intro') === '1'; } catch { /* sin storage: se muestra igual */ }
  if (!intro || reduce || seen) {
    intro && intro.remove();
    startHero();
  } else {
    const t0 = performance.now();
    const done = () => {
      setTimeout(() => {
        intro.classList.add('is-done');
        setTimeout(startHero, 250);
        setTimeout(() => intro.remove(), 1200);
        try { sessionStorage.setItem('belair-intro', '1'); } catch { /* nada */ }
      }, Math.max(0, 1900 - (performance.now() - t0)));
    };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(done);
    setTimeout(() => intro.isConnected && !intro.classList.contains('is-done') && done(), 3500);
  }

  // ---------- Scroll suave (Lenis) ----------
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ duration: 1.25, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
    window.belairLenis = lenis; // útil para probar desde la consola
    if (window.gsap && window.ScrollTrigger) {
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add((time) => lenis.raf(time * 1000));
      window.gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const target = id === '#top' ? document.body : $(id);
    if (!target) return;
    e.preventDefault();
    closeMenu();
    if (lenis) lenis.scrollTo(id === '#top' ? 0 : target, { offset: -20 });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }));

  // ---------- Navegación ----------
  const nav = $('[data-nav]');
  const burger = $('.nav__burger');
  const menu = $('#menu-movil');
  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Abrir menú');
    lenis ? lenis.start() : (document.body.style.overflow = '');
  }
  burger && burger.addEventListener('click', () => {
    if (!menu.hidden) return closeMenu();
    menu.hidden = false;
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Cerrar menú');
    lenis ? lenis.stop() : (document.body.style.overflow = 'hidden');
  });
  addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());

  const links = $$('.nav__links a');
  const secciones = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  const cup = $('.cup-top');
  let lastY = scrollY;

  // ---------- Manifiesto: las palabras se "pintan" con el scroll ----------
  const manif = $('[data-words]');
  const words = manif ? $$('.w', manif) : [];

  const onScroll = () => {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    // nav se esconde al bajar y vuelve al subir
    if (menu.hidden) nav.classList.toggle('is-hidden', y > 160 && y > lastY + 2);
    if (y < lastY - 2) nav.classList.remove('is-hidden');
    lastY = y;
    // link activo
    let actual = null;
    secciones.forEach((s) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) actual = s; });
    links.forEach((a) => a.classList.toggle('is-active', actual && a.getAttribute('href') === `#${actual.id}`));
    // tacita que se llena
    const p = max > 0 ? y / max : 0;
    cup.style.setProperty('--p', p.toFixed(3));
    cup.classList.toggle('is-shown', y > innerHeight * 0.8);
    cup.classList.toggle('is-full', p > 0.985);
    // manifiesto
    if (words.length && root.classList.contains('anim')) {
      const r = manif.getBoundingClientRect();
      const prog = clamp((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35), 0, 1);
      const n = Math.round(prog * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < n));
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Ritual: imagen que cambia con un círculo que se abre ----------
  const steps = $$('.step');
  const frames = $$('.ritual__frame img');
  const bar = $('.ritual__progress span');
  let current = 0, z = 1;
  const setStep = (i) => {
    if (i === current) return;
    frames.forEach((f) => f.classList.remove('was-on'));
    frames[current].classList.remove('is-on');
    frames[current].classList.add('was-on');
    frames[i].style.zIndex = ++z;
    frames[i].classList.add('is-on');
    steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
    if (bar) bar.style.width = `${((i + 1) / steps.length) * 100}%`;
    current = i;
  };
  if (frames.length) frames[0].style.zIndex = 1;
  const stepIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.isIntersecting && setStep(steps.indexOf(e.target)));
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => stepIO.observe(s));

  // ---------- Carta: pestañas con píldora que se desliza ----------
  const tabs = $$('.tabs__btn');
  const pill = $('.tabs__pill');
  const movePill = (btn) => {
    if (!pill || !btn) return;
    pill.style.width = `${btn.offsetWidth}px`;
    pill.style.transform = `translateX(${btn.offsetLeft}px)`;
  };
  const selectTab = (btn, focus) => {
    tabs.forEach((t) => {
      const on = t === btn;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      const panel = $(`#${t.getAttribute('aria-controls')}`);
      panel.hidden = !on;
      if (on) {
        panel.classList.remove('is-in');
        requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-in')));
      }
    });
    movePill(btn);
    btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
    if (focus) btn.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
  const sel = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => movePill(sel));
  addEventListener('resize', () => movePill(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));

  // ---------- Carta: carruseles con flechas y arrastre ----------
  $$('.menu-panel').forEach((panel) => {
    const rail = $('.dishes', panel);
    const [prev, next] = $$('.rail-btn', panel);
    const update = () => {
      const end = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
      prev.disabled = rail.scrollLeft < 4;
      next.disabled = end;
      rail.classList.toggle('at-end', end);
    };
    const paso = () => ($('.dish', rail)?.offsetWidth || 280) + 20;
    prev.addEventListener('click', () => rail.scrollBy({ left: -paso(), behavior: 'smooth' }));
    next.addEventListener('click', () => rail.scrollBy({ left: paso(), behavior: 'smooth' }));
    rail.addEventListener('scroll', update, { passive: true });
    new ResizeObserver(update).observe(rail);
    // arrastrar con el mouse (en celular se desliza con el dedo de forma nativa)
    let x0 = 0, s0 = 0, drag = false;
    rail.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      drag = true; x0 = e.clientX; s0 = rail.scrollLeft;
    });
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 4) rail.classList.add('is-drag');
      rail.scrollLeft = s0 - dx;
    });
    addEventListener('pointerup', () => {
      if (!drag) return;
      drag = false;
      rail.classList.remove('is-drag');
    });
  });

  // ---------- Sucursales: "Abierto ahora" en hora de Santiago ----------
  const ahoraChile = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    return { dia, min: Number(parts.hour) * 60 + Number(parts.minute) };
  };
  const aMin = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const estado = () => {
    const { dia, min } = ahoraChile();
    $$('.place[data-horario]').forEach((el) => {
      let horario = [];
      try { horario = JSON.parse(el.dataset.horario); } catch { return; }
      const hoy = horario.find((h) => h.d.includes(dia));
      const txt = $('.place__status-text', el);
      const abierto = hoy && min >= aMin(hoy.a) && min < aMin(hoy.c);
      el.classList.toggle('is-open', !!abierto);
      if (abierto) { txt.textContent = `Abierto ahora · cierra ${hoy.c}`; return; }
      if (hoy && min < aMin(hoy.a)) { txt.textContent = `Cerrado · abre hoy a las ${hoy.a}`; return; }
      const man = horario.find((h) => h.d.includes((dia + 1) % 7));
      txt.textContent = man ? `Cerrado · abre mañana a las ${man.a}` : 'Cerrado ahora';
    });
  };
  estado();
  setInterval(estado, 60000);

  // ---------- Números que cuentan ----------
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      countIO.unobserve(e.target);
      const el = e.target;
      const dec = el.dataset.countDec;
      const fin = parseFloat((dec || el.dataset.count).replace(',', '.'));
      if (!Number.isFinite(fin) || reduce) return;
      const t0 = performance.now(), dur = 1600;
      const tick = (t) => {
        const k = clamp((t - t0) / dur, 0, 1);
        const v = fin * (1 - Math.pow(1 - k, 3));
        el.textContent = dec ? v.toFixed(1).replace('.', ',') : Math.round(v);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  $$('[data-count], [data-count-dec]').forEach((el) => countIO.observe(el));

  if (reduce) return; // de aquí en adelante, solo movimiento decorativo

  // ---------- Hero: las fotos flotan siguiendo el mouse ----------
  const art = $('[data-parallax-root]');
  const layers = art ? $$('[data-depth]', art) : [];
  let mx = 0, my = 0, cx = 0, cy = 0;
  if (finePointer && art) {
    addEventListener('pointermove', (e) => {
      mx = (e.clientX / innerWidth - 0.5) * 2;
      my = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    const loop = () => {
      cx += (mx - cx) * 0.06; cy += (my - cy) * 0.06;
      layers.forEach((l) => {
        const d = parseFloat(l.dataset.depth);
        l.style.transform = `translate3d(${cx * d * -10}px, ${cy * d * -8}px, 0)`;
      });
      requestAnimationFrame(loop);
    };
    loop();
  }

  // ---------- Cursor suave + botones magnéticos ----------
  if (finePointer) {
    const cur = $('.cursor');
    let x = -100, y = -100, tx = -100, ty = -100;
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; cur.classList.add('is-on'); }, { passive: true });
    document.addEventListener('pointerleave', () => cur.classList.remove('is-on'));
    const follow = () => {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      cur.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      requestAnimationFrame(follow);
    };
    follow();
    $$('a, button, .dish, .gallery__item').forEach((el) => {
      el.addEventListener('pointerenter', () => cur.classList.add('is-big'));
      el.addEventListener('pointerleave', () => cur.classList.remove('is-big'));
    });
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  // ---------- Parallax con GSAP (si cargó) ----------
  const { gsap, ScrollTrigger } = window;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  gsap.to('.hero__art', {
    yPercent: 12, scale: 0.96, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.hero__copy', {
    yPercent: -10, opacity: 0.2, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.fromTo('.cakes__arch img', { yPercent: -10 }, {
    yPercent: 0, ease: 'none',
    scrollTrigger: { trigger: '.cakes', start: 'top bottom', end: 'bottom top', scrub: true },
  });
  gsap.fromTo('.pet__img', { rotate: -8, scale: 0.9 }, {
    rotate: 4, scale: 1, ease: 'none',
    scrollTrigger: { trigger: '.pet', start: 'top bottom', end: 'bottom top', scrub: true },
  });
  if (innerWidth > 980) {
    $$('.gallery__col').forEach((col) => {
      gsap.fromTo(col, { y: 0 }, {
        y: Number(col.dataset.speed) || 0, ease: 'none',
        scrollTrigger: { trigger: '.gallery', start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  }
  // las cintas se inclinan un poquito según la velocidad del scroll
  const ribbons = $$('.ribbon');
  const skew = gsap.quickTo(ribbons, 'skewX', { duration: 0.6, ease: 'power3' });
  ScrollTrigger.create({
    trigger: '.ribbons', start: 'top bottom', end: 'bottom top',
    onUpdate: (s) => skew(clamp(s.getVelocity() / -300, -6, 6)),
  });
  addEventListener('load', () => ScrollTrigger.refresh());
})();
