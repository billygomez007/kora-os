import java.net.URI

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.google.devtools.ksp)
  alias(libs.plugins.roborazzi)
}

// Kora API base URL (docs task "API configuration and network security"):
// debug always defaults to the Android emulator's host-loopback alias
// unless overridden; release has no built-in default at all and must be
// supplied via -PkoraApiBaseUrl=... or the KORA_API_BASE_URL environment
// variable, and is validated below to reject cleartext, localhost, the
// emulator alias, and obvious placeholder hosts -- never silently
// falling back to any of those for a real release build.
val debugApiBaseUrl: String =
  (project.findProperty("koraApiBaseUrl") as String?)
    ?: System.getenv("KORA_API_BASE_URL")
    ?: "http://10.0.2.2:3000/v1/"

val releaseApiBaseUrl: String =
  (project.findProperty("koraApiBaseUrl") as String?)
    ?: System.getenv("KORA_API_BASE_URL")
    ?: ""

fun assertSafeReleaseApiBaseUrl(url: String) {
  if (url.isBlank()) {
    throw GradleException(
      "Release builds require a real API base URL: pass -PkoraApiBaseUrl=https://... " +
        "or set the KORA_API_BASE_URL environment variable."
    )
  }
  if (!url.startsWith("https://")) {
    throw GradleException("Release API base URL must use HTTPS, got: $url")
  }
  val host = URI(url).host?.lowercase() ?: ""
  val forbiddenHosts = setOf("localhost", "127.0.0.1", "10.0.2.2", "example.com", "example.org", "test.com")
  if (host in forbiddenHosts || host.endsWith(".example.com")) {
    throw GradleException("Release API base URL host '$host' is a localhost/emulator/placeholder host, which is never allowed in a release build.")
  }
}

android {
  namespace = "com.realtegic.kora"
  compileSdk { version = release(36) { minorApiLevel = 1 } }

  defaultConfig {
    applicationId = "com.aistudio.chairside.ksghna"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "1.0"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  signingConfigs {
    create("release") {
      val customKeystore = System.getenv("KEYSTORE_PATH")?.let { file(it) }
      val defaultUploadKey = file("${rootDir}/my-upload-key.jks")
      val keystoreFile = when {
        customKeystore?.exists() == true -> customKeystore
        defaultUploadKey.exists() -> defaultUploadKey
        else -> file("${rootDir}/debug.keystore")
      }
      storeFile = keystoreFile
      storePassword = System.getenv("STORE_PASSWORD") ?: "android"
      keyAlias = System.getenv("KEY_ALIAS") ?: if (keystoreFile.name == "debug.keystore") "androiddebugkey" else "upload"
      keyPassword = System.getenv("KEY_PASSWORD") ?: "android"
    }
    create("debugConfig") {
      storeFile = file("${rootDir}/debug.keystore")
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
  }

  buildTypes {
    release {
      isCrunchPngs = false
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      signingConfig = signingConfigs.getByName("release")
      // Validated lazily (only when a Release task is actually requested)
      // rather than eagerly here -- this build-type block is configured
      // by AGP for every Gradle invocation, including plain debug-only
      // commands like `testDebugUnitTest`, which must never fail just
      // because no release URL happens to be configured locally.
      buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")
    }
    debug {
      signingConfig = signingConfigs.getByName("debugConfig")
      buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
    // java.time (Instant/ZoneId/DateTimeFormatter) is used for all
    // branch-timezone conversion and is only natively available from API
    // 26 -- minSdk is 24, so core library desugaring backports it with
    // correct IANA tzdata/DST behavior rather than hand-rolling
    // Calendar/SimpleDateFormat timezone math.
    isCoreLibraryDesugaringEnabled = true
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  testOptions { unitTests { isIncludeAndroidResources = true } }
  dependenciesInfo {
    includeInApk = false
    includeInBundle = true
  }
}

// Enforced only when a Release task is actually part of this invocation's
// task graph -- so a plain debug build/test never fails over a release
// API URL nobody asked for, but `assembleRelease`/`bundleRelease` always
// do if it is missing or unsafe.
gradle.taskGraph.whenReady {
  val buildingRelease = allTasks.any { it.name.contains("Release") && it.path.startsWith(":app:") }
  if (buildingRelease) {
    assertSafeReleaseApiBaseUrl(releaseApiBaseUrl)
  }
}

// Configure the Secrets Gradle Plugin to use .env and .env.example files
// to match the convention used in Web projects.


// Some unused dependencies are commented out below instead of being removed.
// This makes it easy to add them back in the future if needed.
dependencies {
  implementation(platform(libs.androidx.compose.bom))
  implementation(libs.accompanist.permissions)
  implementation(libs.androidx.activity.compose)
  // implementation(libs.androidx.camera.camera2)
  // implementation(libs.androidx.camera.core)
  // implementation(libs.androidx.camera.lifecycle)
  // implementation(libs.androidx.camera.view)
  implementation(libs.androidx.compose.material.icons.core)
  implementation(libs.androidx.compose.material.icons.extended)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.graphics)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.datastore.preferences)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.androidx.navigation.compose)
  implementation(libs.androidx.room.ktx)
  implementation(libs.androidx.room.runtime)
  implementation(libs.androidx.security.crypto)
  implementation(libs.coil.compose)
  implementation(libs.converter.moshi)
  // Uncomment to use Firestore:
  // implementation(libs.firebase.firestore)

  // Uncomment ALL FOUR of the following dependencies together to use Firebase Auth and Google
  // Sign-In via Credential Manager:
  // implementation(libs.firebase.auth)
  // implementation(libs.androidx.credentials)
  // implementation(libs.androidx.credentials.play.services)
  // implementation(libs.googleid)
  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.kotlinx.coroutines.core)
  implementation(libs.logging.interceptor)
  implementation(libs.moshi.kotlin)
  implementation(libs.okhttp)
  implementation(libs.play.services.location)
  implementation(libs.retrofit)
  testImplementation(libs.androidx.compose.ui.test.junit4)
  testImplementation(libs.androidx.core)
  testImplementation(libs.androidx.junit)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.okhttp.mockwebserver)
  testImplementation(libs.robolectric)
  testImplementation(libs.roborazzi)
  testImplementation(libs.roborazzi.compose)
  testImplementation(libs.roborazzi.junit.rule)
  testImplementation(libs.turbine)
  androidTestImplementation(platform(libs.androidx.compose.bom))
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.espresso.core)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.runner)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  debugImplementation(libs.androidx.compose.ui.tooling)
  "ksp"(libs.androidx.room.compiler)
  "ksp"(libs.moshi.kotlin.codegen)
  coreLibraryDesugaring(libs.desugar.jdk.libs)
}
