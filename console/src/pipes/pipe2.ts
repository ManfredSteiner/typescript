import { Readable, Writable, Transform } from 'stream';

// https://blog.yld.io/2016/01/13/using-streams/
// https://stackoverflow.com/questions/35437744/nodejs-streaming-readable-writable-misunderstood

export function start () {

    const in1 = new Readable( { read: function (size) { console.log('in1: read()'); this.push(null); } });
    const in2 = new Readable( { read: function (size) { console.log('in2: read()'); } });
    in2.pause();

    const out1 = new Writable( { decodeStrings: false, write: (chunk, enc, done) => {
        // done(new Error('Problem'));
        console.log('out1: write (' + chunk.toString() + ')');
        const s = chunk.toString();
        in2.push(s, 'utf8');
        done();
    }});

    in1.setEncoding('utf8');
    in2.setEncoding('utf8');

    const out2 = new Writable( { decodeStrings: false, write: (chunk, enc, done) => {
        // done(new Error('Problem'));
        console.log('out2: write (' + chunk.toString() + ')');
        done();
    }});


    for (const w of [ { name: 'out1', stream: out1 }, { name: 'out2', stream: out2 } ]) {
      w.stream.on('close', () => { console.log('  ' + w.name + ' --> event: close')});
      w.stream.on('drain', () => { console.log('  ' + w.name + ' --> event: drain')});
      w.stream.on('error', (err: any) => { console.log('  ' + w.name + ' --> event: error (' + err + ')')});
      w.stream.on('finish', () => { console.log('  ' + w.name + ' --> event: finish')});
      w.stream.on('pipe', (connectedStream: any) => { console.log('  ' + w.name + ' --> event: pipe')});
      w.stream.on('unpipe', (disconnectedStream: any, info: any, arg: any) => { console.log('  ' + w.name + ' --> event: unpipe')});
    }

   for (const r of [ { name: 'in1', stream: in1 }, { name: 'in2', stream: in2 } ]) {
      r.stream.on('close', () => { console.log('  ' + r.name + ' --> event: close')});
      r.stream.on('data', (chunk: any) => { console.log('  ' + r.name + ' --> event: data (' + chunk.toString() + ')')});
      r.stream.on('end', () => { console.log('  ' + r.name + ' --> event: end')});
      r.stream.on('error', (err: any) => { console.log('  ' + r.name + ' --> event: error (' + err + ')')});
      r.stream.on('readable', () => { console.log('  ' + r.name + ' --> event: readable')});
    }

   for (const t of <{ name: string, stream: Transform } []>[] ) {
      t.stream.on('close', () => { console.log('  ' + t.name + ' --> event: close')});
      t.stream.on('data', (chunk: any) => { console.log('  ' + t.name + ' --> event: data (' + chunk.toString() + ')')});
      t.stream.on('end', () => { console.log('  ' + t.name + ' --> event: end')});
      t.stream.on('error', (err: any) => { console.log('  ' + t.name + ' --> event: error (' + err + ')')});
      t.stream.on('readable', () => { console.log('  ' + t.name + ' --> event: readable')});
    }


    setTimeout( () => {
      console.log('job1: start');
      const line = in1.read();
      console.log('job 1: reading --> ' + line);
      const rv = out1.write('Job1 generating data');
      console.log('job 1: writing data -> ' + rv);
      console.log('job 1: end');
    }, 1000);

    setTimeout( () => {
      console.log('job2: start');
      const line = in2.read();
      console.log('job 2: reading --> ' + line);
      console.log('job 2: end');
    }, 2000);

    setTimeout( () => {
      console.log('job1: start');
      const line = in1.read();
      console.log('job 1: reading --> ' + line);
      const rv = out1.write('Job1 generating data second time');
      console.log('job 1: writing data -> ' + rv);
      console.log('job 1: end');
    }, 3000);

    setTimeout( () => {
      console.log('job2: start');
      const line = in2.read();
      console.log('job 2: reading --> ' + line);
      console.log('job 2: end');
    }, 4000);

    console.log('config done!');

}
