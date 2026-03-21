import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // حروف TV show theme — Deep Navy + Neon
        'eid-green': '#00C853',       // نيون أخضر
        'eid-green-light': '#69F0AE', // أخضر فاتح نيون
        'eid-gold': '#C9A227',        // ذهبي دافئ
        'eid-gold-light': '#FFD700',  // ذهبي ساطع
        'eid-sand': '#C8C8D8',        // أبيض/ فضي للنصوص
        'eid-brown': '#8B6914',       // بني ذهبي
        'eid-dark': '#060A17',        // كحلي داكن جداً
        // ألوان حروف الإضافية
        'huroof-navy': '#0A0E1A',
        'huroof-accent': '#1A2040',
        'huroof-red': '#FF2C2C',      // نيون أحمر
        'huroof-red-dark': '#8B0000',
      },
      fontFamily: {
        cairo: ['var(--font-cairo)', 'Cairo', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'shake': 'shake 0.4s ease-in-out',
        'pulse-gold': 'pulseGold 1.5s ease-in-out infinite',
        'timer-shrink': 'timerShrink linear forwards',
        'neon-pulse': 'neonPulse 2s ease-in-out infinite',
        'neon-pulse-red': 'neonPulseRed 2s ease-in-out infinite',
        'letter-float': 'letterFloat linear infinite',
        'logo-glow': 'logoGlow 3s ease-in-out infinite',
        'led-blink': 'ledBlink 1s step-end infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceIn: {
          '0%, 20%, 50%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-15px)' },
          '60%': { transform: 'translateY(-7px)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-8px)' },
          '40%': { transform: 'translateX(8px)' },
          '60%': { transform: 'translateX(-5px)' },
          '80%': { transform: 'translateX(5px)' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(201, 162, 39, 0.4)' },
          '50%': { boxShadow: '0 0 0 12px rgba(201, 162, 39, 0)' },
        },
        timerShrink: {
          '0%': { width: '100%' },
          '100%': { width: '0%' },
        },
        neonPulse: {
          '0%, 100%': { boxShadow: '0 0 5px #00FF7F, 0 0 10px #00FF7F, 0 0 20px #00C853' },
          '50%': { boxShadow: '0 0 10px #00FF7F, 0 0 25px #00FF7F, 0 0 50px #00C853' },
        },
        neonPulseRed: {
          '0%, 100%': { boxShadow: '0 0 5px #FF2C2C, 0 0 10px #FF2C2C, 0 0 20px #CC0000' },
          '50%': { boxShadow: '0 0 10px #FF4444, 0 0 25px #FF2C2C, 0 0 50px #CC0000' },
        },
        letterFloat: {
          '0%': { transform: 'translateY(100vh) rotate(0deg)', opacity: '0' },
          '10%': { opacity: '0.15' },
          '90%': { opacity: '0.08' },
          '100%': { transform: 'translateY(-20vh) rotate(360deg)', opacity: '0' },
        },
        logoGlow: {
          '0%, 100%': { filter: 'drop-shadow(0 0 20px rgba(201, 162, 39, 0.6))' },
          '50%': { filter: 'drop-shadow(0 0 35px rgba(255, 215, 0, 0.9))' },
        },
        ledBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
