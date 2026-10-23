# gscvm documentation

VitePress site for the gscvm T6 GSC virtual machine.

## Development

```sh
npm install
npm run docs:dev
```

## Build

```sh
npm run docs:build
npm run docs:preview
```

The generated site is written to `docs/.vitepress/dist`.

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds the site and
deploys it to GitHub Pages on pushes to `main`. Set the repository's Pages source
to **GitHub Actions**. The workflow sets `VITEPRESS_BASE` to the repository name
so project-site URLs resolve correctly; override `VITEPRESS_BASE` for a custom
domain or a differently named repository.

The site is experimental documentation for experimental software. gscvm is not
affiliated with Activision, Treyarch, xensik, or the upstream `gsc-tool`
maintainers.
