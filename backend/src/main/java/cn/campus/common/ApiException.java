package cn.campus.common;

public final class ApiException extends RuntimeException {
  public final int status;

  public ApiException(String message, int status) {
    super(message);
    this.status = status;
  }

  public ApiException(String message) {
    this(message, 400);
  }
}
