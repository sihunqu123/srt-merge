# srt-merge

Srt-merge is a small node.js project in one hundred lines.
It can merge two srt files into one with some optional options.
It can shift one srt file at given time to match the video file.
It can place one subtitle at the top of screen and another one at bottom that is very useful for language learners.

## What I added from original project

Beautify the srt format:

+ avoid unnecessary `undefine` in the merge-result file.
+ join lines of into 1 line for multiline subtitle.

# Usage

node the-path-to-merge-script.js srt1 srt2 -o -f the-path-of-output-file

e.g.

```bash
node srt-merge/scripts/merge-script.js /media/sf_forshare/en.srt /media/sf_forshare/zh.srt 'top-bottom' -o -f /media/sf_forshare/tb.srt
```
