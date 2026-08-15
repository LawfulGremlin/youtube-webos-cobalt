# Collecting a stock YouTube starter from a rooted TV

The public YouTube packages currently available to this project use a Cobalt
starter that requires newer webOS system libraries. To investigate older TVs,
we need the starter from a stock YouTube installation that actually runs on the
affected TV.

This procedure requires a rooted TV with SSH access. Developer Mode access is
not sufficient because it cannot read the protected application directory.
An installed Content Store application is normally not retained as its
original `.ipk`; the required files are therefore copied from its protected
installation directory instead.

## Before collecting files

1. Install or restore the official YouTube application from the LG Content
   Store.
2. Launch it and confirm that it reaches the YouTube home screen. If possible,
   also start a video.
3. Record the TV model, webOS version and firmware version.

Only collect files from a working stock installation. A starter from an
official app that already crashes on the same TV cannot establish a compatible
baseline.

## 1. Connect to the TV

Enable SSH in Homebrew Channel and connect from a computer. Replace `TV_IP`
with the TV's address and use the SSH username and port configured on the TV.

```sh
ssh root@TV_IP
```

## 2. Locate the official application image

LG normally stores the stock application's runtime in a SquashFS `data.img`.
The visible application directory may contain only metadata, so the absence of
`cobalt` there is not an error.

```sh
APP_DIR=/media/cryptofs/apps/usr/palm/applications/youtube.leanback.v4
IMAGE=/media/cryptofs/apps/usr/palm/data/images/youtube.leanback.v4/data.img

ls -l "$APP_DIR/appinfo.json"
ls -lh "$IMAGE"
sha256sum "$IMAGE"
```

If `data.img` is missing at that path, locate it without modifying anything:

```sh
find /media/cryptofs/apps/usr/palm/data/images \
  -type f -name data.img -path '*youtube.leanback.v4*' 2>/dev/null
```

Set `IMAGE` to the reported path before continuing.

## 3. Collect device and package information

Run this while the working stock app remains installed:

```sh
{
  echo "UTC date: $(date -u)"
  echo "Application path: $APP_DIR"
  echo "Application image: $IMAGE"
  uname -a
  cat /etc/webos-release 2>/dev/null
  luna-send-pub -n 1 \
    'luna://com.webos.service.tv.systemproperty/getSystemInfo' \
    '{"keys":["modelName","firmwareVersion","sdkVersion","boardType"]}'
  ls -l "$APP_DIR/appinfo.json"
  cat "$APP_DIR/appinfo.json"
  sha256sum "$APP_DIR/appinfo.json"
  ls -lh "$IMAGE"
  sha256sum "$IMAGE"
} > /tmp/youtube-webos-stock-info.txt 2>&1

cat /tmp/youtube-webos-stock-info.txt
```

It is okay if `luna-send-pub` is unavailable. Include the remaining information
and report the TV model and firmware manually.

## 4. Copy the files to the computer

Run these commands on the computer, not on the TV:

```sh
scp root@TV_IP:/media/cryptofs/apps/usr/palm/data/images/youtube.leanback.v4/data.img \
  youtube-webos-stock-data.img
scp root@TV_IP:/tmp/youtube-webos-stock-info.txt .
sha256sum youtube-webos-stock-data.img youtube-webos-stock-info.txt
```

If SSH uses a non-default port, add `-P PORT` to both `scp` commands.

## 5. Provide the result

Reply to the relevant GitHub issue with:

- TV model, webOS version and firmware version;
- whether the stock YouTube home screen and playback worked;
- the SHA-256 printed for `data.img`;
- the contents of `youtube-webos-stock-info.txt`.

Upload `youtube-webos-stock-data.img` and
`youtube-webos-stock-info.txt` through the private Dropbox file request:

**[Upload the stock YouTube files privately](https://www.dropbox.com/request/z1tox8du5h3mv4uyupk4)**

No Dropbox account is required. Keep both files unchanged after calculating
their SHA-256 hashes so the maintainer can verify the transfer.

Do not attach `data.img` to a public issue or commit it to a public fork. It is
the complete protected LG/YouTube application image and may include
`drm.nfz`.

Uploaded images are kept as private compatibility inputs. They are used to
analyze the device's Cobalt starter and system ABI and to create new
device-specific AdFree patches and test packages. The original stock image is
not published as a public download.

After confirming that both files reached the computer, the temporary TV files
can be removed:

```sh
rm -f /tmp/youtube-webos-stock-info.txt
```

## What happens next

The starter will first be checked against the webOS firmware symbol database.
If it matches the affected firmware, it can be combined with the patched
Evergreen `libcobalt.so` in a separate legacy test package. The first test
package should remain separate from the normal release until startup and video
playback have both been confirmed. Successful test results can then be used to
support new compatibility patches for the affected device family.
