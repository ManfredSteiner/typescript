import { Readable, Writable, Transform } from 'stream';

// https://blog.yld.io/2016/01/13/using-streams/
// https://stackoverflow.com/questions/35437744/nodejs-streaming-readable-writable-misunderstood

export function start () {

    const source = new Readable( { read: () => {} });

    const between = new Transform( { transform: (chunk, enc, done) => {
        console.log('between: ------------' + chunk.toString() + '----------------');
        done(null, chunk);
        // done('Transform Error on ' + chunk.toString(), null);
    }});

    const target = new Writable( { write: (chunk, enc, done) => {
        console.log('target:  ------------' + chunk.toString() + '----------------');
        // done(new Error('Problem'));
        done();
    }});

    setTimeout( () => { const msg = 'Direct Write'; console.log('\nwrite ' + msg); target.write(msg)}, 1000);

    setTimeout( () => { const msg = 'Super 1'; console.log('\npush ' + msg); source.push(msg)}, 2000);
    setTimeout( () => { const msg = 'Super 2'; console.log('\npush ' + msg); source.push(msg)}, 3000);
    setTimeout( () => { const msg = 'Super 3'; console.log('\npush ' + msg); source.push(msg)}, 4000);
    setTimeout( () => { const msg = 'null'; console.log('\npush ' + msg); source.push(null)}, 5000);


    target.on('close', () => { console.log('  --> target event: close')});
    target.on('drain', (arg: any) => { console.log('  --> target event: drain')});
    target.on('error', (err: any) => { console.log('  --> target event: error ... ' + err)});
    target.on('finish', () => { console.log('  --> target event: finish'); });
    target.on('pipe', (connectedStream: any) => { console.log('  --> target event: pipe'); });
    target.on('unpipe', (disconnectedStream: any, info: any, arg: any) => { console.log('  --> target event: unpipe'); });

    source.on('close', () => { console.log('  --> source event: close')});
    source.on('data', (chunk: any) => { console.log('  --> source event: data ... ' + chunk.toString()); });
    source.on('end', () => { console.log('  --> source event: end'); });
    source.on('error', (err: any) => { console.log('  --> source event: error ...' + err)});
    source.on('readable', () => { console.log('  --> source event: readable')});

    between.on('close', () => { console.log('--> between event: close'); });
    between.on('data', (chunk: any) => { console.log('  --> source event: data ... ' + chunk.toString()); });
    between.on('end', () => { console.log('  --> between event: end') });
    between.on('error', (err: any) => { console.log('--> between event: error  ... ' + err);  });
    between.on('readable', () => { console.log('  --> between event: readable') });

    source.pipe(between).pipe(target);
    // setTimeout( () => { between.unpipe(); }, 2500);
    // setTimeout( () => { between.destroy(); }, 2500);

}
