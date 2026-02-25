const artists = ['Bad Bunny', 'Taylor Swift', 'The Weeknd', 'Drake', 'Karol G', 'Feid', 'Peso Pluma', 'Dua Lipa', 'Shakira', 'Rauw Alejandro', 'J Balvin', 'Billie Eilish', 'Ed Sheeran', 'Aventura', 'Travis Scott'];
Promise.all(artists.map(a => fetch('https://api.deezer.com/search/artist?q=' + encodeURIComponent(a)).then(r => r.json()).then(d => ({ name: a, image: d.data[0].picture_medium }))))
    .then(res => console.log(JSON.stringify(res, null, 2)))
    .catch(console.error);
