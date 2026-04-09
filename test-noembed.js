async function test() {
    let r = await fetch("https://noembed.com/embed?url=https://www.youtube.com/watch?v=kJQP7kiw5Fk");
    let j = await r.json();
    console.log(j.title, j.author_name);
}
test();
