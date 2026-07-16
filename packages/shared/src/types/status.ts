export enum StatusCode {
  NONE = 0,
  WISHLIST = 1,
  DONE = 2,
  DOING = 3,
}

export function statusFromCode(code: number): StatusCode {
  switch (code) {
    case 0: return StatusCode.NONE;
    case 1: return StatusCode.WISHLIST;
    case 2: return StatusCode.DONE;
    case 3: return StatusCode.DOING;
    default: throw new Error(`Invalid status code: ${code}`);
  }
}

export function statusFromString(str: string): StatusCode {
  switch (str) {
    case 'wish':
    case 'wishlist': return StatusCode.WISHLIST;
    case 'done':
    case 'watched': return StatusCode.DONE;
    case 'doing':
    case 'watching': return StatusCode.DOING;
    default: return StatusCode.NONE;
  }
}

export function isActiveStatus(code: StatusCode): boolean {
  return code !== StatusCode.NONE;
}
