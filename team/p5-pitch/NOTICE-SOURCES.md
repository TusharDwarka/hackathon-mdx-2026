# Notice sources for the scraper (V5 P5 item 4), checked Fri 13 Nov 2026

Every URL below was opened tonight with `curl`. Status = HTTP code.

## Official
| Source | URL | Status | Use |
|---|---|---|---|
| CWA RSS feed (all posts) | https://cwa.govmu.org/cwa/?feed=rss2 | 200 RSS | **Use this first.** Newest post: Vacancies 14 Oct 2026. Communiqué posts are there (e.g. ?p=5001, 10 Oct). |
| CWA RSS, news only | https://cwa.govmu.org/cwa/?feed=rss2&cat=2 | 200 RSS | Same, category "News". |
| CWA WordPress API | https://cwa.govmu.org/cwa/?rest_route=/wp/v2/posts | 200 JSON | Full post HTML, which holds the PDF links. `/wp-json/wp/v2/posts` and `/feed/` give **404**: use the `?rest_route=` / `?feed=` form. |
| CWA news page | https://cwa.govmu.org/cwa/?cat=2 | 200 HTML | Same posts as the feed. |
| CWA notice PDFs | `https://cwa.govmu.org/cwa/wp-content/uploads/<yyyy>/<mm>/<file>.pdf` | — | Linked from the posts. Some are images (the 10 Oct notice): no text layer, so the parser needs OCR or the post title. |
| GIS news (government) | https://gis.govmu.org/gis/?page_id=4008 | 200 HTML | Articles at `/gis/?page_id=4008&id=<n>`. |
| GIS RSS | https://gis.govmu.org/gis/?feed=rss2 | 200 RSS | |
| GIS WordPress API | https://gis.govmu.org/gis/?rest_route=/wp/v2/posts | 200 JSON | |
| Met Services, heavy rain warning | https://metservice.intnet.mu/warning-bulletin-heavy-rain-warning.php | 200 HTML | Live page: shows a bulletin only while a warning is active. For the `heavy_rain` reason. |
| Met Services, torrential rain warning | https://metservice.intnet.mu/warning-bulletin-torrential-rain-warning.php | 200 HTML | Same. Issued when 100 mm is reached or likely within the hour. |
| Ministry of Health | https://health.govmu.org/health/ | 200 HTML | No 2026 water notice found. Low priority. |

Old links that no longer work: `govmu.org/EN/newsgov/...` (404; GIS moved to gis.govmu.org/gis/).

## News (RSS)
| Outlet | Feed | Status |
|---|---|---|
| Defimedia | https://defimedia.info/rss.xml | 200 XML (all news; filter "CWA", "eau", "Mare-aux-Vacoas") |
| Le Mauricien, Société | https://www.lemauricien.com/category/actualites/societe/feed/ | 200 RSS |
| Le Mauricien, all | https://www.lemauricien.com/feed/ | 200 RSS |
| ION News | https://ionnews.mu/feed/ | 200 RSS |
| Inside News | https://www.inside.news/feed/ | 200 RSS |
| L'Express | https://lexpress.mu/rss, /feed | **403** (blocked). Its stories also appear on fr.allafrica.com. |

News items are reports *about* notices: store `source = news` so the UI can tell them apart from CWA posts.

## Facebook: manual paste only
CWA page: https://www.facebook.com/cwa170/ (Central Water Authority, hotline 170 in the handle). No scraping (login wall + terms). Ops copies the post text into the "Paste a CWA notice" box.
