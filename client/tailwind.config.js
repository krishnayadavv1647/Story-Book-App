/**
 * Semantic theme scale. Colour comes from the dark cinematic palette in
 * client/src/styles/index.css; every dimension below is still the value measured
 * from `H98QB4Tdo6iH2EaXCerUlv` frame 1:2 and `eQzIIC5gfOmGE392HvA7aC` frame 1:2.
 *
 * Names are semantic on purpose. There is no `lime` any more: primary action is
 * `gold`, selection and focus are `teal`, and nothing in the app may reach for a
 * raw palette colour.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Ground and surfaces.
        page: 'var(--background)',
        'page-deep': 'var(--background-deep)',
        surface: {
          DEFAULT: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          elevated: 'var(--surface-elevated)',
          hover: 'var(--surface-hover)',
          overlay: 'var(--surface-overlay)',
        },
        // Kept as distinct names because they carry meaning at the call site.
        tag: 'var(--surface-secondary)',
        pill: 'var(--surface-elevated)',
        avatar: 'var(--surface-elevated)',
        skeleton: 'var(--skeleton)',

        // Text.
        ink: {
          DEFAULT: 'var(--text-primary)',
          muted: 'var(--text-secondary)',
          subtle: 'var(--text-muted)',
          'on-gold': 'var(--text-on-gold)',
        },

        // Borders. `hairline` is the default rule everywhere.
        hairline: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          muted: 'var(--border-muted)',
        },

        // Primary action.
        gold: {
          DEFAULT: 'var(--gold-flat)',
          start: 'var(--gold-start)',
          middle: 'var(--gold-middle)',
          end: 'var(--gold-end)',
          border: 'var(--gold-border)',
        },

        // Selection, focus and supporting state.
        teal: {
          DEFAULT: 'var(--teal-primary)',
          bright: 'var(--teal-bright)',
          muted: 'var(--teal-muted)',
          soft: 'var(--teal-soft)',
          focus: 'var(--teal-focus)',
        },

        // Status. Never repurposed for decoration.
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        info: 'var(--info)',

        // The one light surface: the printed label under a book cover.
        paper: {
          DEFAULT: 'var(--paper)',
          ink: 'var(--paper-ink)',
          'ink-muted': 'var(--paper-ink-muted)',
          line: 'var(--paper-line)',
          hover: 'var(--paper-hover)',
        },

        scrim: 'var(--scrim)',
        'cover-placeholder': 'var(--cover-placeholder)',
        'cover-glyph': 'var(--cover-glyph)',

        // The cover artwork's own ground, measured from the book-card frame. A
        // cover with no image is this colour, exactly as the frame draws it.
        'book-cover': 'var(--book-cover-ground)',
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },

      // Every size that appears in the approved screens, and no others.
      fontSize: {
        '2xs': ['11px', '1.35'], // tags, badges, count pill
        xs: ['12px', '1.4'], // field labels, credits, meta
        sm: ['13px', '1.45'], // body, input values, small buttons
        base: ['14px', '1.45'], // nav labels, card titles, buttons
        md: ['15px', '1.4'], // summary title, icon glyphs
        lg: ['17px', '1.35'], // topbar wordmark
        xl: ['18px', '1.35'], // sidebar brand
        '2xl': ['19px', '1.3'], // section heading (Story Plan)
        section: ['22px', '1.25'], // section heading (Dashboard)
        '3xl': ['25px', '1.2'], // page H1
        display: ['48px', '1.05'], // hero wordmark
      },

      /**
       * The default rule is sub-pixel on purpose. A 1px hairline on a near-black
       * ground reads as a bright white outline around every card — louder than
       * the content it contains — even when its colour is a dark teal. At 0.3px
       * the browser draws one device pixel at roughly a third alpha, which is
       * the weight this theme wants. `border-1` is the escape hatch for an edge
       * that is deliberately visible, such as the Dashboard banner's gold rule.
       */
      borderWidth: {
        DEFAULT: '0.3px',
        1: '1px',
      },

      borderRadius: {
        sm: '6px', // inputs, tags, row actions, callout
        DEFAULT: '7px', // icon buttons, active nav row, footer buttons
        md: '7px',
        lg: '8px', // cards, topbar controls, primary top button
        xl: '10px', // cover art
        // The Story Agent composer. Larger than anything the approved frames
        // draw, and deliberately so: it is the one place in the product that is
        // a conversation rather than a form, and the softer shell is what says
        // that before you read a word of it.
        '2xl': '16px',
        pill: '999px',
      },

      spacing: {
        sidebar: 'var(--sidebar-w)',
        // Control heights straight from the design.
        'control-xs': '26px', // tag
        'control-sm': '30px', // row action, status badge
        'control-md': '34px', // icon button
        'control-lg': '36px', // input, select, add page
        'control-xl': '40px', // footer button
        'control-2xl': '42px', // page-header action
      },

      boxShadow: {
        // The system is border-led. Shadows exist only for lifted overlays, and
        // stay restrained — a dark theme does not need a glow on every card.
        overlay: '0 18px 44px rgba(0, 0, 0, 0.55)',
        card: '0 12px 32px rgba(0, 0, 0, 0.22)',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.97)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'scale-in': 'scale-in 140ms ease-out',
        'slide-in': 'slide-in 140ms ease-out',
      },
    },
  },
  plugins: [],
};
