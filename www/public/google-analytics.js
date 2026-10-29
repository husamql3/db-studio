(() => {
	if (location.hostname !== "dbstudio.sh" || document.getElementById("ga4-tag")) return;

	window.dataLayer = window.dataLayer || [];
	function gtag() {
		window.dataLayer.push(arguments);
	}
	window.gtag = gtag;
	gtag("js", new Date());
	gtag("config", "G-PTKK3W2G0T", {
		allow_google_signals: false,
		allow_ad_personalization_signals: false,
	});

	const tag = document.createElement("script");
	tag.id = "ga4-tag";
	tag.async = true;
	tag.src = "https://www.googletagmanager.com/gtag/js?id=G-PTKK3W2G0T";
	document.head.append(tag);

	const socialPlatforms = new Map([
		["x.com", "X"],
		["twitter.com", "X"],
		["www.linkedin.com", "LinkedIn"],
		["linkedin.com", "LinkedIn"],
		["discord.gg", "Discord"],
		["www.reddit.com", "Reddit"],
	]);

	// Site header, footer, or the heading of the section the click came from.
	function clickLocation(el) {
		if (el.closest("header.sticky")) return "header";
		if (el.closest("footer")) return "footer";
		if (location.pathname.startsWith("/docs")) return "docs";
		const heading = el.closest("section")?.querySelector("h1, h2")?.textContent;
		return heading ? heading.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 100) : "content";
	}

	function trackClick(event) {
		if (
			!(event.target instanceof Element) ||
			(event.type === "click" && event.button !== 0) ||
			(event.type === "auxclick" && event.button !== 1)
		)
			return;

		const install = event.target.closest("[data-analytics-install]");
		if (install) {
			gtag("event", "copy_install_command", {
				package_manager: install.dataset.analyticsInstall,
				click_location: clickLocation(install),
			});
			return;
		}

		// fumadocs code blocks label their copy button "Copy Text" until it flips to "Copied Text".
		const copyCode = event.target.closest('button[aria-label="Copy Text"]');
		if (copyCode) {
			const code = copyCode.closest("figure")?.querySelector("pre")?.textContent?.trim();
			gtag("event", "copy_code", {
				click_target: (code?.split("\n")[0] || "code").slice(0, 100),
				click_location: clickLocation(copyCode),
			});
			return;
		}

		const link = event.target.closest("a[href]");
		if (!link) return;
		const url = new URL(link.href);
		if (url.protocol !== "https:" && url.protocol !== "http:") return;

		let eventName;
		let target;
		if (url.hostname === "github.com" && url.pathname.startsWith("/husamql3/db-studio")) {
			eventName = "github_click";
			target = url.pathname.slice("/husamql3/db-studio".length).replace(/^\//, "") || "repo";
		} else if (url.hostname === "www.npmjs.com" && url.pathname === "/package/db-studio") {
			eventName = "npm_click";
			target = "db-studio";
		} else if (socialPlatforms.has(url.hostname)) {
			eventName = "social_click";
			target = socialPlatforms.get(url.hostname);
		} else if (url.origin === location.origin && url.pathname !== location.pathname) {
			eventName = url.pathname.startsWith("/docs") ? "docs_click" : "navigation_click";
			target = url.pathname;
		}

		if (!eventName) return;
		gtag("event", eventName, {
			click_target: target.slice(0, 100),
			click_location: clickLocation(link),
			link_domain: url.hostname,
		});
	}

	document.addEventListener("click", trackClick);
	document.addEventListener("auxclick", trackClick);
})();
