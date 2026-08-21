# Release signing

Play will not accept an unsigned or debug-signed bundle. This is a one-time
setup; after it, `./gradlew bundleRelease` produces an upload-ready `.aab`.

**The key is not in this repo and never will be.** It was deliberately not
generated for you by tooling either: a signing key is only as good as the fact
that exactly one person has ever seen its password, and a password typed by an
assistant has been through a transcript. You generate it, you hold it.

---

## 1. Generate the upload key

Run this from the repo root. It will prompt for a password and for your name and
organisation. The organisation fields are cosmetic; the password is not.

```bash
keytool -genkey -v -keystore gdimension-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias gdimension
```

`-validity 10000` is about 27 years. Play rejects keys that expire before 2033,
so do not shorten it.

## 2. Move the key somewhere safe

Keep the `.jks` **outside the repository**. `android/.gitignore` covers `*.jks`,
but a gitignore rule is a convention, not a guarantee, and `git add -f` bypasses
it without complaint. One directory up from the repo is enough:

```bash
mv gdimension-upload.jks ~/Desktop/
```

## 3. Point the build at it

```bash
cp android/keystore.properties.example android/keystore.properties
```

Then edit `android/keystore.properties` with the real password and the path to
the `.jks`. `storeFile` resolves relative to `android/app/`, so a key at
`~/Desktop/gdimension-upload.jks` alongside the repo is `../../gdimension-upload.jks`.

`keystore.properties` is gitignored.

## 4. Build the bundle

`cap sync` does not build the web app, so the Vite build comes first or the
bundle ships stale JavaScript.

```bash
npm run build
npx cap sync android
cd android && ./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

Confirm it is actually signed before uploading:

```bash
jarsigner -verify -verbose -certs \
  app/build/outputs/bundle/release/app-release.aab | head -5
```

---

## Back it up, but do not panic about it

Store the `.jks` and its password in a password manager, and keep a second copy
somewhere that is not this laptop.

Losing it is a bad day rather than a catastrophe, which was not true a few years
ago. New apps use **Play App Signing**: Google holds the actual app signing key
and re-signs every upload, and the key you hold is only the *upload* key. A lost
upload key can be reset through Play Console support. What you must never lose
is your access to the Play account itself.

## How the build behaves without a key

`android/app/build.gradle` guards the whole signing block behind
`hasSigning`, which is just "does `keystore.properties` exist". Without it,
debug builds, `./gradlew tasks`, and CI all still work, and only release signing
is absent. Without that guard, a machine with no keystore fails at Gradle
*configuration* time and nothing builds at all.
