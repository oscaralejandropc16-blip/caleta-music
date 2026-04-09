async function run() {
    console.log("Fetching stream...");
    const u = "https://inv.thepixora.com/latest_version?id=kJQP7kiw5Fk&itag=140&local=true";
    const res = await fetch(u, { method: "HEAD" });
    console.log(res.status, res.headers.get("content-type"));
}
run();
