/* BusNova Pro reservation core, written in C17 and compiled to WebAssembly.
   All 36 seat status checks and mutations pass through this module. */
#define SEAT_COUNT 36
static unsigned char occupied[SEAT_COUNT];

int bn_seat_count(void) { return SEAT_COUNT; }
int bn_reset(void) {
    for (int i = 0; i < SEAT_COUNT; ++i) occupied[i] = 0;
    return 1;
}
int bn_status(int seat) {
    if (seat < 0 || seat >= SEAT_COUNT) return -1;
    return occupied[seat] != 0;
}
int bn_import(int seat, int status) {
    if (seat < 0 || seat >= SEAT_COUNT || (status != 0 && status != 1)) return 0;
    occupied[seat] = (unsigned char)status;
    return 1;
}
int bn_reserve(int seat) {
    if (seat < 0 || seat >= SEAT_COUNT || occupied[seat]) return 0;
    occupied[seat] = 1;
    return 1;
}
int bn_cancel(int seat) {
    if (seat < 0 || seat >= SEAT_COUNT || !occupied[seat]) return 0;
    occupied[seat] = 0;
    return 1;
}
int bn_available(void) {
    int count = 0;
    for (int i = 0; i < SEAT_COUNT; ++i) if (!occupied[i]) ++count;
    return count;
}
