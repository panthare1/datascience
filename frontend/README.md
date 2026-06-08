# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

lt112-web/
├── node_modules/      ← downloaded libraries (ignore, never touch)
├── public/            ← static files (favicon, etc.)
├── src/               ← YOUR code goes here
│   ├── App.jsx        ← the main component, what we'll edit
│   ├── App.css
│   ├── index.css
│   ├── main.jsx       ← entry point that loads App.jsx
│   └── assets/
├── index.html         ← root HTML, rarely touched
├── package.json       ← project config and dependencies
└── vite.config.js     ← Vite settings

fronted - vite as building tool and React framework