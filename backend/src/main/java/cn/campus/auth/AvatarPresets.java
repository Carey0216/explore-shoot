package cn.campus.auth;

import java.util.Set;

/** Only these original bundled avatars can be selected, never arbitrary URLs or file paths. */
public final class AvatarPresets {
  private AvatarPresets() {}

  public static final Set<String> IDS =
      Set.of(
          "alpine",
          "sea",
          "forest",
          "lake",
          "cat",
          "dog",
          "fox",
          "panda",
          "rabbit",
          "bear",
          "penguin",
          "koala",
          "astronaut",
          "robot",
          "cloud",
          "sprout",
          "anime-sakura",
          "anime-blue",
          "anime-mint",
          "anime-night");
}
