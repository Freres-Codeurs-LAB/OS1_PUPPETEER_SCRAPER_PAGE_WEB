const fs = require('fs');
const { exit } = require('process');
const puppeteer = require('puppeteer');
const numeral = require('numeral');
const { parse } = require('json2csv');

(async () => {
    // constantes
    const search = "frères codeurs";
    const useXPathForButton = true;
    const limitResults = 5;

    // options du navigateur
    const browserOptions = {
        headless: false, // mettre à true pour utiliser le mode 'invisible'
        defaultViewport: {// fenêtre du navigateur
            width: 1000,
            height: 1000
        }
    };

    // initialisation du navigateur avec les options
    const browser = await puppeteer.launch(browserOptions);

    // PARTIE 1 : faire les screenshots des pages de résultats
    var resultsUrl = await getResultsUrl();
    const page = await browser.newPage();
    for (var i = 0; i < resultsUrl.length; i++) {// chargement de chaque page avant de prendre un screenshot
        await page.goto(resultsUrl[i], { waitUntil: 'load' });
        await page.screenshot({ path: `./results/capture_${i}.png` });
    }
    await page.close();

    // PARTIE 2 : extraire les données des vidéos et les exporter en CSV
    var resultsVideo = await getVideosData();
    fs.writeFileSync('./results/data.csv', parse(resultsVideo));

    // fermeture du navigateur avant la fin du script
    await browser.close();
    exit(0);

    async function getResultsUrl() {// fonction pour récupérer les url des résultats de la recherche sur Bing
        // création d'une page et chargement de Bing
        const page = await browser.newPage();
        await page.goto('https://www.bing.com', { waitUntil: 'networkidle2' });

        // entrée de texte dans l'input
        await page.type('input#sb_form_q', search, { delay: 20 });

        // clique sur l'élément correspondant au bouton
        if (!useXPathForButton) {
            await page.click('label[for=sb_form_go]');
        } else {
            var [btnXPathSelector] = await page.$x("/html/body/div[@class='hpapp']/div[@class='hp_body  ']/div[@class='hpl hp_cont']/div[@class='sbox ']/form[@id='sb_form']/label[@class='search icon tooltip']");
            await btnXPathSelector.click();
        }

        // on attend le chargement des résultats
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // crétion de la fonction de 'getter' pour le evaluate
        await page.exposeFunction("getLimitResults", () => limitResults);

        var results = await page.evaluate(
            async () => {// toutes les commandes dans l'evaluate sont exécutées dans le navigateur                
                // on parcourt les éléments pour extraire les données
                var data = [];
                var elements = document.querySelectorAll('.b_algo h2 a[href]');
                for (var elem of elements) {
                    if (data.length >= await getLimitResults()) break;
                    data.push(elem.getAttribute('href'));
                }
                return data;
            });

        await page.close();
        return results;
    }

    async function getVideosData() {// fonction pour extraire les données des vidéos de la recherche sur Bing
        // création d'une page et ouverture de Bing
        const page = await browser.newPage();
        await page.goto('https://www.bing.com/videos/search?qft=+filterui:msite-youtube.com&q=' + encodeURI(search), { waitUntil: 'networkidle2' });

        // listener sur l'évènement 'console' du navigateur pour afficher dans le terminal
        page.on('console', consoleObj => console.log(consoleObj.text()));

        var results = await page.evaluate(
            async () => {// toutes les commandes dans l'evaluate sont exécutées dans le navigateur 
                // on parcourt les éléments pour extraire les données
                var data = [];
                var videoDivs = document.getElementsByClassName("dg_u");
                for (var div of videoDivs) {
                    var title = div.getElementsByClassName("mc_vtvc_title")[0].textContent;
                    var meta = div.getElementsByClassName("mc_vtvc_meta_row")[0].textContent;
                    var url = div.getElementsByClassName("mc_vtvc_link")[0].getAttribute("href");
                    console.log(meta);
                    data.push({
                        title: title,
                        url: url,
                        meta: meta
                    });
                }
                return data;
            });

        await page.close();

        // organisation et tri des données avant le retour de la fonction
        var cleanResults = [];
        for (var res of results) {
            var viewsPart = res.meta.split("vues")[0];
            var datePart = res.meta.split("vues")[1];
            cleanResults.push({
                title: res.title,
                url: "https://www.bing.com" + res.url,
                views: numeral(viewsPart.toLowerCase().replace(/\s|de/g, "").replace(",", ".")).value(),
                date: datePart.replace("Il y a ", "")
            });
        }
        return cleanResults;
    }
})();