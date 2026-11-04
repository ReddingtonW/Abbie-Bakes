# GitHub Pages redirect

This branch is not the website. It exists only so the old GitHub Pages address,
`reddingtonw.github.io/Abbie-Bakes/`, forwards visitors to the new site at
**https://homebird-bakes.co.uk** after the rebrand.

GitHub Pages can't send real (301) redirects, so each old page is a tiny HTML file
that forwards straight to the same page on the new domain. It keeps any `?query` and
`#section`, and falls back to a meta refresh and a plain link if JavaScript is off.
`404.html` catches any other old address and sends it to the matching page, or to the
home page.

| Old address | New address |
|---|---|
| `/Abbie-Bakes/` | `https://homebird-bakes.co.uk/` |
| `/Abbie-Bakes/menu.html` | `https://homebird-bakes.co.uk/menu` |
| `/Abbie-Bakes/gallery.html` | `https://homebird-bakes.co.uk/gallery` |
| `/Abbie-Bakes/about.html` | `https://homebird-bakes.co.uk/about` |
| `/Abbie-Bakes/order.html` | `https://homebird-bakes.co.uk/order` |
| `/Abbie-Bakes/thanks.html` | `https://homebird-bakes.co.uk/thanks` |
| anything else | `https://homebird-bakes.co.uk/` |

## Switching it on (at go-live, once homebird-bakes.co.uk is serving the site)

Repo **Settings → Pages → Build and deployment → Branch**: choose `github-pages-redirect`,
folder `/ (root)`, then **Save**.

## Switching it off (after a few months)

Same screen: set the branch to **None**. The old address then returns GitHub's 404.
