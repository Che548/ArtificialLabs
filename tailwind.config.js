/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './App.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './design-system/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#D31471',
          soft: '#EA4087',
          burgundy: '#823537',
          success: '#1FBB74',
        },
        ink: {
          DEFAULT: '#212123',
          muted: '#736E6C',
        },
        text: {
          secondary: '#736E6C',
        },
        surface: {
          canvas: '#F5F3F3',
          raised: '#FFFFFF',
          warm: '#FDECE5',
          rose: '#FEE8E3',
          divider: '#EDEDED',
        },
        state: {
          disabled: '#C8C3C1',
          error: '#D93838',
        },
      },
      fontFamily: {
        sf: ['SFProDisplay-Regular'],
        'sf-medium': ['SFProDisplay-Medium'],
        'sf-semibold': ['SFProDisplay-Semibold'],
        'sf-bold': ['SFProDisplay-Bold'],
        yaro: ['YaroRg'],
      },
      boxShadow: {
        card: '0 12px 30px rgba(55, 31, 39, 0.10)',
      },
      borderRadius: {
        'card-sm': '12px',
        'card-md': '20px',
        'card-lg': '30px',
        'card-xl': '40px',
      },
    },
  },
  plugins: [],
};
