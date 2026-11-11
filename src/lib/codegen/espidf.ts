import type { WiringConnection } from '../../types'
import {
  baseFilename,
  buildContext,
  detectFeatures,
  makeExplanation,
  makeTitle,
  type CodeDraft,
  type LocalCodeInput,
} from './shared'

/**
 * ESP-IDF target.
 *
 * The Arduino target is the "batteries included" firmware path. ESP-IDF is
 * deliberately emitted as a reviewable project scaffold: it initialises the
 * exact pins from the wiring plan, brings up I2C / UART / Wi-Fi, serves a small
 * HTTP status page and documents the managed components needed for each module.
 * That keeps the output honest instead of pretending every sensor has a
 * maintained ESP-IDF driver.
 */

const cPin = (connection: WiringConnection | undefined, fallback = '-1'): string =>
  connection?.boardPinCode ?? fallback

export function generateEspIdfCode(input: LocalCodeInput): CodeDraft {
  const ctx = buildContext(input)
  const f = detectFeatures(ctx)
  const notes: string[] = []
  const libraries: string[] = []
  const includes = new Set<string>([
    '<stdio.h>',
    '<string.h>',
    '<freertos/FreeRTOS.h>',
    '<freertos/task.h>',
    '<driver/gpio.h>',
    '<esp_log.h>',
    '<esp_system.h>',
    '<nvs_flash.h>',
  ])
  const defines: string[] = []
  const globals: string[] = []
  const prototypes: string[] = []
  const setupCalls: string[] = []
  const functions: string[] = []
  const reportLines: string[] = []
  const pinRows: string[] = []

  const addDefine = (name: string, value: string) => defines.push(`#define ${name} ${value}`)

  addDefine('READ_INTERVAL_MS', String(f.intervalMs))
  addDefine('TAG', '"makerwire"')

  const sda = ctx.firstI2C('i2c-sda')
  const scl = ctx.firstI2C('i2c-scl')
  const sck = ctx.firstSPI('spi-sck')
  const mosi = ctx.firstSPI('spi-mosi')
  const miso = ctx.firstSPI('spi-miso')

  if (f.hasI2C && sda && scl) {
    includes.add('<driver/i2c.h>')
    addDefine('I2C_SDA_GPIO', cPin(sda))
    addDefine('I2C_SCL_GPIO', cPin(scl))
    addDefine('I2C_PORT', 'I2C_NUM_0')
    prototypes.push('static void i2c_bus_init(void);', 'static void i2c_bus_scan(void);')
    setupCalls.push('i2c_bus_init();', 'i2c_bus_scan();')
    functions.push(`static void i2c_bus_init(void)
{
    i2c_config_t config = {};
    config.mode = I2C_MODE_MASTER;
    config.sda_io_num = I2C_SDA_GPIO;
    config.scl_io_num = I2C_SCL_GPIO;
    config.sda_pullup_en = GPIO_PULLUP_ENABLE;
    config.scl_pullup_en = GPIO_PULLUP_ENABLE;
    config.master.clk_speed = 400000;
    ESP_ERROR_CHECK(i2c_param_config(I2C_PORT, &config));
    ESP_ERROR_CHECK(i2c_driver_install(I2C_PORT, I2C_MODE_MASTER, 0, 0, 0));
    ESP_LOGI(TAG, "I2C ready: SDA=%d SCL=%d @ 400 kHz", I2C_SDA_GPIO, I2C_SCL_GPIO);
}

static void i2c_bus_scan(void)
{
    ESP_LOGI(TAG, "Scanning I2C bus...");
    for (uint8_t address = 0x08; address < 0x78; address++) {
        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);
        i2c_master_write_byte(cmd, (address << 1) | I2C_MASTER_WRITE, true);
        i2c_master_stop(cmd);
        esp_err_t result = i2c_master_cmd_begin(I2C_PORT, cmd, pdMS_TO_TICKS(30));
        i2c_cmd_link_delete(cmd);
        if (result == ESP_OK) {
            ESP_LOGI(TAG, "  found device at 0x%02X", address);
        }
    }
}`)
    libraries.push('ESP-IDF driver/i2c (legacy master API)')
  } else if (f.hasI2C) {
    notes.push('I2C components are present but the wiring plan has no complete SDA/SCL pair. Fix the wiring before flashing.')
  }

  if (f.hasUart) {
    includes.add('<driver/uart.h>')
    const uartParts = ctx.parts.filter(
      (part) => part.def.id === 'neo6m-gps' || part.def.id === 'a7670e-lte',
    )
    uartParts.forEach((part, index) => {
      const prefix = part.def.id === 'neo6m-gps' ? 'GPS' : 'LTE'
      const tx = ctx.pin(part.def.id, 'tx')
      const rx = ctx.pin(part.def.id, 'rx')
      const baud = part.def.id === 'neo6m-gps' ? 9600 : 115200
      const port = index === 0 ? 'UART_NUM_1' : 'UART_NUM_2'
      addDefine(`${prefix}_UART_PORT`, port)
      addDefine(`${prefix}_RX_GPIO`, cPin(tx))
      addDefine(`${prefix}_TX_GPIO`, cPin(rx))
      addDefine(`${prefix}_BAUD`, String(baud))
      prototypes.push(`static void ${prefix.toLowerCase()}_uart_init(void);`)
      setupCalls.push(`${prefix.toLowerCase()}_uart_init();`)
      functions.push(`static void ${prefix.toLowerCase()}_uart_init(void)
{
    uart_config_t config = {};
    config.baud_rate = ${prefix}_BAUD;
    config.data_bits = UART_DATA_8_BITS;
    config.parity = UART_PARITY_DISABLE;
    config.stop_bits = UART_STOP_BITS_1;
    config.flow_ctrl = UART_HW_FLOWCTRL_DISABLE;
    config.source_clk = UART_SCLK_DEFAULT;
    ESP_ERROR_CHECK(uart_driver_install(${prefix}_UART_PORT, 2048, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(${prefix}_UART_PORT, &config));
    ESP_ERROR_CHECK(uart_set_pin(${prefix}_UART_PORT, ${prefix}_TX_GPIO, ${prefix}_RX_GPIO,
                                 UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));
    ESP_LOGI(TAG, "${prefix} UART ready: RX=%d TX=%d @ %d baud",
             ${prefix}_RX_GPIO, ${prefix}_TX_GPIO, ${prefix}_BAUD);
}`)
      reportLines.push(`ESP_LOGI(TAG, "  ${part.def.shortName}: TX→GPIO %s, RX→GPIO %s", "${cPin(tx)}", "${cPin(rx)}");`)
    })
    libraries.push('ESP-IDF driver/uart')
    if (f.hasGps) notes.push('GPS: the scaffold brings up UART1 and prints raw NMEA. Add the esp-idf-lib nmea parser or minmea for coordinates.')
    if (f.hasLte) notes.push('A7670E: the scaffold initialises UART but does not open a data context. Use the SIMCom AT command sequence for your carrier and a dedicated 5 V / 2 A supply.')
  }

  if (f.hasRelay) {
    const relay = ctx.pin('relay-1ch', 'in')
    addDefine('RELAY_GPIO', cPin(relay))
    addDefine('RELAY_ACTIVE_LOW', '1')
    prototypes.push('static void relay_set(bool on);')
    functions.push(`static void relay_set(bool on)
{
    int level = RELAY_ACTIVE_LOW ? (on ? 0 : 1) : (on ? 1 : 0);
    gpio_set_level(RELAY_GPIO, level);
    ESP_LOGI(TAG, "Relay %s", on ? "ON" : "OFF");
}`)
    setupCalls.push(
      'gpio_reset_pin(RELAY_GPIO);',
      'gpio_set_direction(RELAY_GPIO, GPIO_MODE_OUTPUT);',
      'gpio_set_level(RELAY_GPIO, 1);',
    )
    reportLines.push(`ESP_LOGI(TAG, "  Relay input: GPIO %s (active low)", "${cPin(relay)}");`)
    notes.push('Relay output switches mains potential on many modules. Enclose the board, keep low-voltage wiring separated, and never touch the circuit while energised.')
  }

  if (f.hasLed) {
    const led = ctx.pin('led-5mm', 'a')
    addDefine('USER_LED_GPIO', cPin(led))
    setupCalls.push(
      'gpio_reset_pin(USER_LED_GPIO);',
      'gpio_set_direction(USER_LED_GPIO, GPIO_MODE_OUTPUT);',
    )
    reportLines.push(`ESP_LOGI(TAG, "  User LED: GPIO %s", "${cPin(led)}");`)
  }

  if (f.hasBuzzer) {
    const buzzer = ctx.pin('active-buzzer', 'sig')
    addDefine('BUZZER_GPIO', cPin(buzzer))
    setupCalls.push(
      'gpio_reset_pin(BUZZER_GPIO);',
      'gpio_set_direction(BUZZER_GPIO, GPIO_MODE_OUTPUT);',
      'gpio_set_level(BUZZER_GPIO, 0);',
    )
    reportLines.push(`ESP_LOGI(TAG, "  Buzzer: GPIO %s", "${cPin(buzzer)}");`)
  }

  if (f.hasServo) {
    const servo = ctx.pin('sg90-servo', 'pwm')
    addDefine('SERVO_GPIO', cPin(servo))
    reportLines.push(`ESP_LOGI(TAG, "  Servo PWM: GPIO %s (configure LEDC at 50 Hz)", "${cPin(servo)}");`)
    notes.push('SG90: use the ESP-IDF LEDC peripheral at 50 Hz and map 0.5–2.5 ms pulses to 0–180°. Power the servo from a separate 5 V supply with a common ground.')
  }

  if (f.hasStepper) {
    const step = ctx.pin('a4988-stepper', 'step')
    const dir = ctx.pin('a4988-stepper', 'dir')
    const en = ctx.pin('a4988-stepper', 'en')
    addDefine('STEPPER_STEP_GPIO', cPin(step))
    addDefine('STEPPER_DIR_GPIO', cPin(dir))
    addDefine('STEPPER_EN_GPIO', cPin(en))
    setupCalls.push(
      'gpio_reset_pin(STEPPER_STEP_GPIO);',
      'gpio_set_direction(STEPPER_STEP_GPIO, GPIO_MODE_OUTPUT);',
      'gpio_reset_pin(STEPPER_DIR_GPIO);',
      'gpio_set_direction(STEPPER_DIR_GPIO, GPIO_MODE_OUTPUT);',
      'gpio_reset_pin(STEPPER_EN_GPIO);',
      'gpio_set_direction(STEPPER_EN_GPIO, GPIO_MODE_OUTPUT);',
      'gpio_set_level(STEPPER_EN_GPIO, 0);',
    )
    reportLines.push(`ESP_LOGI(TAG, "  A4988: STEP=%s DIR=%s EN=%s", "${cPin(step)}", "${cPin(dir)}", "${cPin(en)}");`)
    notes.push('A4988: set the current limit before connecting the motor. VMOT needs a separate motor supply and a 100 µF capacitor across VMOT/GND.')
  }

  if (f.hasNeopixel) {
    const din = ctx.pin('ws2812b-strip', 'din')
    addDefine('NEOPIXEL_GPIO', cPin(din))
    reportLines.push(`ESP_LOGI(TAG, "  WS2812B DIN: GPIO %s (add espressif/led_strip)", "${cPin(din)}");`)
    libraries.push('espressif/led_strip (managed component — add to idf_component.yml)')
    notes.push('WS2812B: add the espressif/led_strip managed component, use a separate 5 V supply and a 330–470 Ω series resistor on DIN.')
  }

  if (f.hasOled || f.hasTft || f.hasBme || f.hasMpu || f.hasRtc) {
    if (f.hasOled) {
      const oled = ctx.pin('ssd1306-oled', 'sda')
      libraries.push('esp-idf-lib ssd1306 or u8g2 (managed component)')
      notes.push(`SSD1306 OLED at 0x3C: use esp-idf-lib ssd1306 on the generated I2C bus (SDA ${cPin(oled, 'I2C_SDA_GPIO')}).`)
    }
    if (f.hasTft) {
      const cs = ctx.pin('ili9341-tft', 'cs')
      const dc = ctx.pin('ili9341-tft', 'dc')
      addDefine('TFT_CS_GPIO', cPin(cs))
      addDefine('TFT_DC_GPIO', cPin(dc))
      if (sck) addDefine('TFT_SCK_GPIO', cPin(sck))
      if (mosi) addDefine('TFT_MOSI_GPIO', cPin(mosi))
      libraries.push('espressif/esp_lcd_ili9341 (managed component)')
      notes.push(`ILI9341: use esp_lcd_ili9341 with SPI2/SPI3. CS GPIO ${cPin(cs)}, DC GPIO ${cPin(dc)}.`)
    }
    if (f.hasBme) {
      libraries.push('esp-idf-lib bme280 (managed component)')
      notes.push('BME280: initialise esp-idf-lib bme280 on the generated I2C bus and check the address (0x76 or 0x77).')
    }
    if (f.hasMpu) {
      libraries.push('esp-idf-lib mpu6050 (managed component)')
      notes.push('MPU6050: initialise esp-idf-lib mpu6050 on the generated I2C bus at 0x68 or 0x69.')
    }
    if (f.hasRtc) {
      libraries.push('esp-idf-lib ds3231 (managed component)')
      notes.push('DS3231: initialise esp-idf-lib ds3231 and keep a CR2032 fitted for time retention.')
    }
  }

  if (f.hasSd) {
    const cs = ctx.pin('microsd-spi', 'cs')
    addDefine('SD_CS_GPIO', cPin(cs))
    libraries.push('ESP-IDF sdspi / FATFS')
    notes.push(`microSD: mount with esp_vfs_fat_sdspi_mount using CS GPIO ${cPin(cs)} and the generated SPI bus. Format the card as FAT32.`)
  }

  if (f.hasCamera) {
    notes.push('OV2640: use the esp32-camera managed component and the ESP32-S3 LCD_CAM peripheral. DVP data/clock pins must match the hardware peripheral, not arbitrary GPIOs.')
  }

  if (f.hasDht) {
    const data = ctx.pin('dht22', 'data')
    addDefine('DHT22_GPIO', cPin(data))
    reportLines.push(`ESP_LOGI(TAG, "  DHT22 DATA: GPIO %s (add a 4.7–10 kΩ pull-up)", "${cPin(data)}");`)
    libraries.push('esp-idf-lib dht (managed component)')
  }

  if (f.hasUltrasonic) {
    const trig = ctx.pin('hc-sr04', 'trig')
    const echo = ctx.pin('hc-sr04', 'echo')
    addDefine('HCSR04_TRIG_GPIO', cPin(trig))
    addDefine('HCSR04_ECHO_GPIO', cPin(echo))
    reportLines.push(`ESP_LOGI(TAG, "  HC-SR04: TRIG=%s ECHO=%s (ECHO needs a divider)", "${cPin(trig)}", "${cPin(echo)}");`)
    notes.push('HC-SR04: ECHO is 5 V. Fit a divider or level shifter before the ESP32-S3 GPIO. Use the RMT peripheral or a µs timer for a stable pulse measurement.')
  }

  if (f.hasGas) {
    const ao = ctx.pin('mq2', 'ao')
    addDefine('MQ2_AO_GPIO', cPin(ao))
    notes.push('MQ-2: analog output can reach 5 V. Use a divider before the ADC and allow a warm-up period. Calibrate against a known reference.')
  }

  if (f.hasPot) {
    const wiper = ctx.pin('potentiometer', 'wiper')
    addDefine('POT_GPIO', cPin(wiper))
  }

  if (f.hasButton) {
    const button = ctx.pin('pushbutton', 'sig')
    addDefine('BUTTON_GPIO', cPin(button))
    setupCalls.push(
      'gpio_reset_pin(BUTTON_GPIO);',
      'gpio_set_direction(BUTTON_GPIO, GPIO_MODE_INPUT);',
      'gpio_pullup_en(BUTTON_GPIO);',
    )
  }

  // ── Wi-Fi + HTTP server ──────────────────────────────────────────────────
  const useWifi = ctx.boardWifi && (f.wantsWifi || f.wantsWeb)
  if (useWifi) {
    includes.add('<freertos/event_groups.h>')
    includes.add('<esp_wifi.h>')
    includes.add('<esp_event.h>')
    includes.add('<esp_netif.h>')
    addDefine('WIFI_SSID', '"YOUR_WIFI_SSID"')
    addDefine('WIFI_PASSWORD', '"YOUR_WIFI_PASSWORD"')
    globals.push(
      'static EventGroupHandle_t wifi_events;',
      '#define WIFI_CONNECTED_BIT BIT0',
    )
    prototypes.push('static void wifi_init_sta(void);')
    setupCalls.push('wifi_init_sta();')
    functions.push(`static void wifi_event_handler(void *arg, esp_event_base_t base,
                                int32_t event_id, void *event_data)
{
    if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "Wi-Fi disconnected, retrying...");
        esp_wifi_connect();
    } else if (base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "Wi-Fi connected: " IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(wifi_events, WIFI_CONNECTED_BIT);
    }
}

static void wifi_init_sta(void)
{
    wifi_events = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&config));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                                        &wifi_event_handler, NULL, NULL));
    wifi_config_t wifi_config = {};
    strncpy((char *)wifi_config.sta.ssid, WIFI_SSID, sizeof(wifi_config.sta.ssid));
    strncpy((char *)wifi_config.sta.password, WIFI_PASSWORD, sizeof(wifi_config.sta.password));
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "Connecting to Wi-Fi SSID '%s'", WIFI_SSID);
    xEventGroupWaitBits(wifi_events, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE,
                        pdMS_TO_TICKS(15000));
}`)
    libraries.push('ESP-IDF esp_wifi / esp_http_server')

    if (f.wantsWeb) {
      includes.add('<esp_http_server.h>')
      globals.push('static httpd_handle_t http_server = NULL;')
      prototypes.push('static void http_server_start(void);')
      setupCalls.push('http_server_start();')
      const handlerNames: string[] = []
      const registrations: string[] = []
      functions.push(`static esp_err_t root_handler(httpd_req_t *request)
{
    const char *page =
        "<!doctype html><html><head><meta charset=\\"utf-8\\">"
        "<meta name=\\"viewport\\" content=\\"width=device-width,initial-scale=1\\">"
        "<title>MakerWire Node</title>"
        "<style>body{font-family:system-ui,sans-serif;background:#071017;color:#e2e8f0;"
        "padding:32px}h1{color:#54e6b1}section{background:#0d1821;border:1px solid #203444;"
        "border-radius:16px;padding:20px;margin:16px 0}a{display:inline-block;background:#13ac7b;"
        "color:#04110b;padding:12px 18px;border-radius:10px;text-decoration:none;margin-right:8px}"
        "</style></head><body><h1>${ctx.board.shortName.replace(/[^a-zA-Z0-9 .-]/g, '')}</h1>"
        "<p>MakerWire AI · ESP-IDF firmware</p>"
        "<section><h2>Status</h2><p>Open <code>/status</code> for JSON.</p>"
        "${f.hasRelay ? '<p><a href=\\"/relay/on\\">Relay ON</a><a href=\\"/relay/off\\">Relay OFF</a></p>' : ''}"
        "</section></body></html>";
    httpd_resp_set_type(request, "text/html");
    return httpd_resp_send(request, page, HTTPD_RESP_USE_STRLEN);
}`)
      handlerNames.push('root_handler')

      functions.push(`static esp_err_t status_handler(httpd_req_t *request)
{
    char payload[192];
    int length = snprintf(payload, sizeof(payload),
        "{\\"firmware\\":\\"makerwire-esp-idf\\",\\"board\\":\\"%s\\",\\"uptime_ms\\":%lld%s}",
        "${ctx.board.shortName.replace(/[^a-zA-Z0-9 .-]/g, '')}",
        (long long)(esp_timer_get_time() / 1000)
        ${f.hasRelay ? ', ",\\"relay\\":true"' : ''});
    httpd_resp_set_type(request, "application/json");
    return httpd_resp_send(request, payload, length);
}`)
      handlerNames.push('status_handler')

      if (f.hasRelay) {
        functions.push(`static esp_err_t relay_on_handler(httpd_req_t *request)
{
    relay_set(true);
    httpd_resp_set_status(request, "303 See Other");
    httpd_resp_set_hdr(request, "Location", "/");
    return httpd_resp_send(request, "Relay ON", HTTPD_RESP_USE_STRLEN);
}

static esp_err_t relay_off_handler(httpd_req_t *request)
{
    relay_set(false);
    httpd_resp_set_status(request, "303 See Other");
    httpd_resp_set_hdr(request, "Location", "/");
    return httpd_resp_send(request, "Relay OFF", HTTPD_RESP_USE_STRLEN);
}`)
        handlerNames.push('relay_on_handler', 'relay_off_handler')
        registrations.push(
          '{ .uri = "/relay/on", .method = HTTP_GET, .handler = relay_on_handler, .user_ctx = NULL },',
          '{ .uri = "/relay/off", .method = HTTP_GET, .handler = relay_off_handler, .user_ctx = NULL },',
        )
      }

      functions.push(`static void http_server_start(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;
    if (httpd_start(&http_server, &config) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start HTTP server");
        return;
    }
    const httpd_uri_t routes[] = {
        { .uri = "/", .method = HTTP_GET, .handler = root_handler, .user_ctx = NULL },
        { .uri = "/status", .method = HTTP_GET, .handler = status_handler, .user_ctx = NULL },
${registrations.map((line) => `        ${line}`).join('\n')}
    };
    for (size_t i = 0; i < sizeof(routes) / sizeof(routes[0]); i++) {
        httpd_register_uri_handler(http_server, &routes[i]);
    }
    ESP_LOGI(TAG, "HTTP server listening on port 80");
}`)
      notes.push('Set WIFI_SSID and WIFI_PASSWORD near the top of main.cpp before building. Do not commit real credentials.')
    }
  } else if (f.wantsWeb) {
    notes.push(`${ctx.board.name} is not a Wi-Fi board. The ESP-IDF scaffold starts the HTTP server only when Wi-Fi is available; add an Ethernet or LTE data path for remote access.`)
    if (f.hasRelay) {
      notes.push('The relay can still be driven over the serial console or a local button in a follow-up firmware revision.')
    }
  }

  // ── Boot report & sensor task ───────────────────────────────────────────
  const reportBlock = reportLines.length
    ? `\nstatic void log_board_map(void)\n{\n    ESP_LOGI(TAG, "Board: ${ctx.board.name.replace(/"/g, '\\"')} (${ctx.board.logicVoltage} V logic)");\n${reportLines.map((line) => `    ${line}`).join('\n')}\n}`
    : ''
  if (reportBlock) {
    prototypes.push('static void log_board_map(void);')
    setupCalls.unshift('log_board_map();')
    functions.push(reportBlock.trim())
  }

  const taskLines: string[] = []
  if (f.hasRelay) {
    taskLines.push('    static bool relay_state = false;', '    relay_state = !relay_state;', '    relay_set(relay_state);')
  }
  if (f.hasLed) {
    taskLines.push('    static bool led_state = false;', '    led_state = !led_state;', '    gpio_set_level(USER_LED_GPIO, led_state ? 1 : 0);')
  }
  if (f.hasBuzzer) {
    taskLines.push('    gpio_set_level(BUZZER_GPIO, 1);', '    vTaskDelay(pdMS_TO_TICKS(60));', '    gpio_set_level(BUZZER_GPIO, 0);')
  }
  if (f.hasUart) {
    if (f.hasGps) taskLines.push('    uart_write_bytes(GPS_UART_PORT, "$PMTK220,1000*1F\\r\\n", 18);')
    if (f.hasLte) taskLines.push('    uart_write_bytes(LTE_UART_PORT, "AT+CSQ\\r\\n", 8);')
  }
  if (f.hasI2C) {
    taskLines.push('    ESP_LOGI(TAG, "I2C bus heartbeat");')
  }
  if (taskLines.length === 0) {
    taskLines.push('    ESP_LOGI(TAG, "Heartbeat — add your sensor driver here");')
  }

  functions.push(`static void sensor_task(void *argument)
{
    ESP_LOGI(TAG, "Sensor task started (interval ${f.intervalMs} ms)");
    while (true) {
${taskLines.join('\n')}
        vTaskDelay(pdMS_TO_TICKS(READ_INTERVAL_MS));
    }
}`)
  prototypes.push('static void sensor_task(void *argument);')
  setupCalls.push('xTaskCreate(sensor_task, "makerwire_task", 4096, NULL, 5, NULL);')

  // Include esp_timer if status handler uses it.
  if (useWifi && f.wantsWeb) includes.add('<esp_timer.h>')

  const title = makeTitle(ctx.prompt, ctx.parts[0]?.def.shortName ?? 'MakerWire')
  const header = `/*
 * MakerWire AI — ESP-IDF firmware scaffold
 * Project : ${title}
 * Board   : ${ctx.board.name} (${ctx.board.chip})
 * Logic   : ${ctx.board.logicVoltage} V
 * Prompt  : ${ctx.prompt.replace(/\n/g, ' ').slice(0, 160)}
 * Wiring  : ${ctx.plan.connections.length} connections / ${ctx.plan.stats.signals} signals
 *
 * Build:
 *   idf.py set-target ${ctx.board.family === 'Espressif' ? 'esp32s3' : 'esp32'}
 *   idf.py build flash monitor
 *
 * The pin map below is taken from the MakerWire wiring plan. Sensor drivers
 * marked as managed components are intentionally not vendored into this file.
 */`

  const componentReport = ctx.parts
    .map(
      (part) =>
        ` *   - ${part.def.name}: ${part.def.interfaces.join(', ')}${part.def.i2cAddress ? ` @ ${part.def.i2cAddress}` : ''}${part.def.codeHints?.length ? ` (${part.def.codeHints.slice(0, 2).join(', ')})` : ''}`,
    )
    .join('\n')

  const code = [
    header,
    '',
    Array.from(includes)
      .map((header) => `#include ${header}`)
      .join('\n'),
    '',
    defines.join('\n'),
    '',
    globals.join('\n'),
    '',
    prototypes.join('\n'),
    '',
    functions.join('\n\n'),
    '',
    `extern "C" void app_main(void)
{
    ESP_LOGI(TAG, "MakerWire AI ESP-IDF firmware starting");
    esp_err_t nvs_result = nvs_flash_init();
    if (nvs_result == ESP_ERR_NVS_NO_FREE_PAGES || nvs_result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        nvs_result = nvs_flash_init();
    }
    ESP_ERROR_CHECK(nvs_result);

${setupCalls.map((line) => `    ${line}`).join('\n')}
}`,
    '',
    '/* Component overview from the wiring plan:',
    componentReport || ' *   - No components selected.',
    ' */',
    '',
  ].join('\n')

  notes.unshift(
    `ESP-IDF scaffold generated from the exact MakerWire pin map (${ctx.plan.connections.length} connections). The Arduino target gives you ready-to-flash sensor libraries; this target gives you a native project skeleton, I2C bus scan, UART bring-up and Wi-Fi/HTTP plumbing.`,
  )
  if (f.hasSd) notes.push('Add FATFS and SDSPI to CMakeLists.txt and mount the card after the SPI bus is initialised.')
  if (!ctx.parts.some((part) => part.def.id === 'ssd1306-oled') && f.hasOled) {
    notes.push('OLED selected but no I2C bus found. Fix the wiring before using the display.')
  }

  const explanation = makeExplanation(ctx, f, notes)
  libraries.push('ESP-IDF v5.x')

  return {
    code,
    libraries: Array.from(new Set(libraries)).sort((a, b) => a.localeCompare(b)),
    explanation,
    filename: baseFilename(ctx, 'esp-idf', title),
  }
}
