

// imports
var _ = require('lodash-node')
 	  , casper = require('casper').create({verbose: true, logLevel: "info"});

// var db = new Datastore({filename: 'linkedin.db', autoload: true})
var URL_ROOT = "https://www.linkedin.com";


var terms = ["angularjs", "scala"];
var unvisited = []
  , visited = [];


casper.cli.drop("cli");
casper.cli.drop("casper-path");

if (!casper.cli.has("u") || !casper.cli.has("p")) {
    casper.echo('usage: casperjs linkedin.js --u=username --p=password --terms=js,java --pages=30').exit();
}


// Add function to lodasah to generate a catesian product
_.mixin({'cartesian': function() {
    return _.reduce(arguments, function(mtrx, vals) {
        return _.reduce(vals, function(array, val) {
            return array.concat(
                _.map(mtrx, function(row){ return row.concat(val); })
            );
        }, []);
    }, [[]]);
}});

/**
 *  Login for LinkedIn
 */
function loginStep() {
	this.fill('form#login', { 
		session_key: casper.cli.get("u"),
		session_password: casper.cli.get("p")
	}, true);
};


/**
 * Generates seed URLs that we can crawl
 */
function addSearchLinksStep(numPages, terms, pastCompanies, currentCompanies, schools) {
	return function() {
		unvisited = unvisited.concat(getSearchLinks(numPages, terms, pastCompanies, currentCompanies, schools));
	}
};

function getSearchLinks(numPages, terms, pastCompanies, currentCompanies, schools) {
	if(!terms) throw new Error("need terms to search against");

	return _.map(_.cartesian(_.range(1,numPages+1), terms), function(pair) {
		return {url: [URL_ROOT, "/vsearch/p", 
					"?page_num=", pair[0], 
					"&keywords=", pair[1],
					"&f_G=", "us%3A0",
					"&f_N=", "S,O", 
					"&f_PC=", (pastCompanies || []).join(","),
					"&f_CC=", (currentCompanies || []).join(","),
					"&f_ED=", (schools || []).join(",")
		].join(""), type: "search"};
	});
};

/**
 * Main method to crawl profiles, will pick one up the queue, fetch the profiles and
 * continue crawling. Needs to be logged in to work.
 */
function crawlProfilesStep() {
	console.log("crawling profiles with", unvisited.length, "links");
	
	if(_.isEmpty(unvisited)) {
		casper.exit();
		return;
	}

	var user = unvisited.shift()
	  , url = user.url;

	casper
		.thenBypassIf(function checkIfCrawled() {
			return _.contains(visited, url);
		}, 1)
		.thenOpen(url, function visitLink(resp) {
			if(resp.status !== 200) {
				this.log("error from server fetching " + url, "error");
				casper.exit();
			}

			visited.push(user);
			unvisited = unvisited.concat(
				_.shuffle(this.evaluate(getEngineeringProfiles)));
		})
		.wait(~~(Math.random()*10000))
		.run(crawlProfilesStep);
};

/**
 * Impossible to generalize b/c of the way phantomjs evaluate works; it will
 * conver this function into a string losing the scope/closures.
 * @returns {name: "", tagline: "", url: ""}
 */
function getEngineeringProfiles() {
	var profiles = $("li.people").map(function(i,e) {
		return {
			name: $(e).find("h3").text(),
			tagline: $(e).find("p").text(),
			url: $(e).find("a")[0].href,
			type: "user",
			source: "search"
		}
	});
	return profiles;
	/*return _.filter(profiles, function(e) {
		return /engineer|developer/i.test(e.tagline);
	});*/
}

// And go!

// Some convenience IDs..
var topSchoolIds = [17939,17926,19232,18867,17950,18946,43610,18321,18158,17811];

// microsoft, amazon, google, apple, zynga, facebook, linkedin, juniper, palantir, twitter
var topCompanyIds = [1035,1441,162479,10667,1586,1337,2240,167907,96622,20708];

var terms = casper.cli.get("terms").split(",")

var pages = casper.cli.get("pages") || 10;

casper
	.userAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.124 Safari/537.36")
	.start(URL_ROOT + "/nhome", loginStep) 
	.then(addSearchLinksStep(pages, terms, null, null, null))
	// .then(addSearchLinksStep(30, terms, null, topCompanyIds, null))
	// .then(addSearchLinksStep(30, terms, null, null, topSchoolIds))
	.run(crawlProfilesStep);