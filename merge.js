const Subtitle = require('subtitle');

function getContent(arr, beginIndex, endIndex) {
  let str = [];
  for (let i = beginIndex; i <= endIndex; i++) {
    const line = arr[i];
    str += `${line} `;
  }
  return str.trim();
}

function getEmptyLines(arr, beginIndex, endIndex) {
  const resultArr = [];
  for (let i = beginIndex; i <= endIndex; i++) {
    const line = arr[i];
    if(line.match(/^\s+$/)) {
      resultArr.push(i);
    }
  }
  return resultArr;
}

function formatSRT(str) {
  const arr = ('\n' + str).split(/\r?\n\r?/g);

  const resultArr = [];

  let i = 0;
  let lastLineNumber = -1;
  let lastIndex = -1;
  let isIndexInited = false;

  // 00:00:16,000 --> 00:00:17,590

  const isNewSubtitle = (line1, line2, line3) => {
    const retVal = line1.trim() === ''
      && line2.match(/^\d+$/)
      && line3.match(/^\d{1,2}:\d{1,2}:\d{1,2}(,\d+)\s+-->\s+\d{1,2}:\d{1,2}:\d{1,2}(,\d+)\s*$/)
    return retVal;
  }

  for(let i = 0; i < arr.length - 2; i++) {
    const line1 = arr[i];
    const line2 = arr[i+1];
    const line3 = arr[i+2];

    if( // found the first subtitle index
      !isIndexInited
      &&
      isNewSubtitle(line1, line2, line3)
    ) {
      const newIndex = Number.parseInt(line2, 10);
      lastIndex = newIndex;
      lastLineNumber = i;
      isIndexInited = true;
      // will only save until contents found of this index
      // resultArr.push(line1.trim(), line2.trim());
    } else if( // found next subtitle index
      isIndexInited
      && Number.parseInt(line2, 10) === lastIndex + 1
      && isNewSubtitle(line1, line2, line3)
    ) {
      const newIndex = Number.parseInt(line2, 10);
      const content =  getContent(arr
        , lastLineNumber + 3 // skip the index/timeline line
        , i - 1); // preserve only 1 empty line before index number

      if(content) { // skip empty content subtitle
        resultArr.push('', arr[lastLineNumber + 1].trim(), arr[lastLineNumber + 2].trim(), content);
      }
      // update context
      lastIndex = newIndex;
      lastLineNumber = i;
    } else { // do nothing when in the conent line

    }

  }

  // handle the final subtitle
  const content =  getContent(arr
    , lastLineNumber + 3 // skip the index/timeline line
    , arr.length - 1);

  if(content) { // skip empty content subtitle
    resultArr.push(arr[lastLineNumber + 1].trim(), arr[lastLineNumber + 2].trim(), content);
  }


  // console.info(`format result: ${JSON.stringify(resultArr, null, 2)}`);

  return resultArr.join('\n');
}


function merge(srtPrimary, srtSecondary, attrs, noString) {
  if (typeof srtPrimary === 'string') {
    srtPrimary = formatSRT(srtPrimary);
    srtPrimary = Subtitle.parse(srtPrimary);
  }
  if (typeof srtSecondary === 'string') {
    srtSecondary = formatSRT(srtSecondary);
    srtSecondary = Subtitle.parse(srtSecondary);
  }
  if (typeof srtPrimary !== 'object' || typeof srtSecondary !== 'object') {
    throw new Error('cannot parse srt file');
  }
  if(attrs) {
    if (typeof attrs === 'string') { attrs = [attrs]; }
    // top-bottom and move-merge must be performed before nearest-cue, so here is a sort
    attrs.sort((attr1, attr2) => {
      const order = ['s', 't', 'm', 'n'];
      return order.indexOf(attr1[0]) - order.indexOf(attr2[0]);
    });
    attrs.forEach(attr => {
      if (attr) { attr = attr.trim(); }
      if (attr === 'top-bottom') {
        srtPrimary = clearPosition(srtPrimary);
        srtSecondary = clearPosition(srtSecondary);
        srtSecondary.forEach(caption => {
          caption.text = '{\\an8}' + caption.text;
        });
      } else if (/^nearest-cue-[0-9]+(-no-append)?$/.test(attr)) {
        const threshold = parseInt(attr.substring(attr.lastIndexOf('cue-') + 4));
        const srtPrimaryTimeArray = srtPrimary.map(caption => caption.start);
        const noAppend = attr.indexOf('-no-append') > -1;
        const append = function(captionA, captionB) {
          if(noAppend) {
            captionB.start = captionA.start;
            if(Math.abs(captionB.end - captionA.end) <= threshold) {
              captionB.end = captionA.end;
            }
            return captionB;
          } else {
            captionA.text = captionA.text + '\n' + captionB.text;
            return undefined;
          }
        };
        // try to merge srtSecondary into srtPrimary, failed captions stay in srtSecondary
        srtPrimary = copySrt(srtPrimary);
        srtSecondary = srtSecondary.map(caption => {
          let index = binarySearch(caption.start, srtPrimaryTimeArray);
          if (index === -1) {
            if (srtPrimary[0].start - caption.start <= threshold) {
              return append(srtPrimary[0], caption);
            } else { return caption; }
          } else if (caption.start - srtPrimary[index].start <= threshold) {
            return append(srtPrimary[index], caption);
          } else if (index === srtPrimary.length - 1) {
            return caption;
          } else if (srtPrimary[index + 1].start - caption.start <= threshold) {
            return append(srtPrimary[index+1], caption);
          } else {
            return caption;
          }
        }).filter(caption => (caption !== undefined));
      } else if (/^move-[-]?[0-9]+$/.test(attr)) {
        const delay = parseInt(attr.substring(attr.lastIndexOf('e-') + 2));
        srtSecondary = Subtitle.resync(srtSecondary, delay);
      } else if (attr !== undefined && attr !== 'simple' && attr !== '') {
        throw new Error('Cannot parse attr');
      }
    });
  }
  let srt3 = srtPrimary.concat(srtSecondary);
  srt3.sort((caption1, caption2) => {
    return caption1.start - caption2.start;
  });
  return noString ? srt3 : Subtitle.stringify(srt3);
}

function clearPosition(srt) {
  return srt.map(caption => {
    caption = Object.assign({}, caption);
    caption.text = caption.text.replace(/{\\a[n]?[0-9]}/g, '');
    caption.text = caption.text.replace(/{\\pos\([0-9]+,[0-9]+\)}/g, '');
    return caption;
  });
}

function copySrt(srt) {
  return srt.map(caption => Object.assign({}, caption));
}

function binarySearch(value, array, comp) {
  let left = 0, right = array.length;
  while(right > left) {
    let mid = Math.floor((left + right) / 2);
    let result;
    if(comp) {
      result = comp(array[mid], value);
    } else {
      result = array[mid] < value ? -1 : array[mid] > value ? 1 : 0;
    }
    if(result === 0) { return mid; }
    if(result < 0) { left = mid + 1; }
    else { right = mid; }
  }
  return left - 1;
}

module.exports = {
  merge
};
