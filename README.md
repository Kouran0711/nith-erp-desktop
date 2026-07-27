# Nith ERP Desktop

Aplicativo Electron da Nith ERP com:

- domínio remoto configurado pelo GitHub Pages;
- instalador Windows NSIS;
- atalhos no desktop e no menu Iniciar;
- execução na bandeja do Windows;
- verificação automática de novas versões;
- download automático da atualização;
- botão para reiniciar e instalar;
- publicação pelo GitHub Actions e GitHub Releases.

## Configuração utilizada

- Configuração de domínio: `https://kouran0711.github.io/nith-app-config/app-config.json`
- Repositório esperado para versões: `Kouran0711/nith-erp-desktop`

## Primeira publicação

1. Crie no GitHub um repositório público chamado `nith-erp-desktop`.
2. Envie todos os arquivos deste projeto para a raiz do repositório.
3. Confira se o `package.json` está com `"version": "1.0.0"`.
4. Crie e envie a tag `v1.0.0`.
5. O GitHub Actions irá gerar e publicar:
   - `Nith-ERP-Setup-1.0.0.exe`
   - `latest.yml`
   - arquivos `.blockmap` necessários para a atualização.

## Publicar uma atualização

1. Altere a versão no `package.json`, por exemplo de `1.0.0` para `1.0.1`.
2. Faça commit da alteração.
3. Crie a tag com a mesma versão: `v1.0.1`.
4. Envie a tag ao GitHub.
5. Aguarde a Action finalizar.

Clientes com uma versão anterior instalada receberão o aviso automaticamente.

## Comandos locais opcionais

```powershell
npm install
npm start
npm run dist
```

Para publicar pelo Git local:

```powershell
git add .
git commit -m "Versão 1.0.1"
git push origin main
git tag v1.0.1
git push origin v1.0.1
```

## Observações

- O repositório de atualizações precisa ser público para clientes consultarem o GitHub Releases sem token privado.
- A primeira instalação precisa ser feita pelo instalador NSIS. O ZIP portátil antigo não consegue migrar sozinho para o atualizador.
- Sem certificado de assinatura de código, o Windows pode mostrar o aviso do SmartScreen. Isso não significa necessariamente que o arquivo contém vírus, mas reduz a confiança visual do instalador.
