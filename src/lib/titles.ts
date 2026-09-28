import { isSunday } from "./dates";
import { getSundayTitle } from "./liturgical";

export const SPECIAL_DEFAULT_TITLE = "NGÀY LỄ ĐẶC BIỆT";

/** Tên mặc định: Chúa Nhật thì theo lịch phụng vụ, ngày thường thì tên chung. */
export function defaultTitle(date: string): string {
  return isSunday(date) ? getSundayTitle(date) : SPECIAL_DEFAULT_TITLE;
}

export const FEAST_SUGGESTIONS = [
  "LỄ CHÚA GIÁNG SINH - LỄ ĐÊM",
  "LỄ CHÚA GIÁNG SINH - LỄ NGÀY",
  "TẾT TRUNG THU THIẾU NHI",
  "LỄ TRO",
  "THỨ NĂM TUẦN THÁNH",
  "LỄ VỌNG PHỤC SINH",
  "LỄ ĐỨC MẸ VÔ NHIỄM NGUYÊN TỘI",
  "LỄ ĐỨC MARIA MẸ THIÊN CHÚA",
  "THÁNH LỄ GIAO THỪA",
  "THÁNH LỄ MỒNG 1 TẾT",
  "LỄ BỔN MẠNG GIÁO XỨ",
  "LỄ BỔN MẠNG THIẾU NHI",
];
