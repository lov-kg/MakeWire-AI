import type { ComponentDefinition } from '../../types'
import { analog, digital, i2c, makeComponent, spi, uart } from '../component-builders'

const i2cSensors: Array<{
  id: string
  name: string
  manufacturer: string
  address: string
  tags: string[]
  description?: string
  voltage?: number | { min: number; max: number; typical: number }
  logicVoltage?: number
  fiveVoltTolerant?: boolean
  industrial?: boolean
  operatingTempC?: [number, number]
  datasheetUrl?: string
}> = [
  { id: 'sht31', name: 'SHT31 Temperature + Humidity', manufacturer: 'Sensirion', address: '0x44', tags: ['temperature', 'humidity', 'precision'], description: 'High-accuracy digital temperature and humidity sensor with a calibrated I2C output.', industrial: true, operatingTempC: [-40, 125] },
  { id: 'sht40', name: 'SHT40 Temperature + Humidity', manufacturer: 'Sensirion', address: '0x44', tags: ['temperature', 'humidity', 'low-power'], description: 'Fourth-generation Sensirion humidity sensor with low power and high accuracy.', industrial: true, operatingTempC: [-40, 125] },
  { id: 'sht35', name: 'SHT35 Precision Temperature + Humidity', manufacturer: 'Sensirion', address: '0x44', tags: ['temperature', 'humidity', 'precision'], industrial: true },
  { id: 'aht20', name: 'AHT20 Temperature + Humidity', manufacturer: 'ASAIR', address: '0x38', tags: ['temperature', 'humidity', 'low-cost'] },
  { id: 'am2320', name: 'AM2320 Temperature + Humidity', manufacturer: 'Aosong', address: '0x5c', tags: ['temperature', 'humidity', 'i2c'] },
  { id: 'si7021', name: 'SI7021 Temperature + Humidity', manufacturer: 'Silicon Labs', address: '0x40', tags: ['temperature', 'humidity', 'low-power'] },
  { id: 'hdc1080', name: 'HDC1080 Temperature + Humidity', manufacturer: 'Texas Instruments', address: '0x40', tags: ['temperature', 'humidity', 'low-power'] },
  { id: 'bmp280', name: 'BMP280 Pressure + Temperature', manufacturer: 'Bosch', address: '0x76 or 0x77', tags: ['pressure', 'temperature', 'altitude'] },
  { id: 'bme680', name: 'BME680 Air Quality + Pressure', manufacturer: 'Bosch', address: '0x76 or 0x77', tags: ['air-quality', 'gas', 'pressure', 'temperature', 'humidity'] },
  { id: 'bmp388', name: 'BMP388 High-Precision Barometer', manufacturer: 'Bosch', address: '0x76 or 0x77', tags: ['pressure', 'altitude', 'drone'], industrial: true },
  { id: 'sgp30', name: 'SGP30 TVOC + eCO2', manufacturer: 'Sensirion', address: '0x58', tags: ['air-quality', 'tvoc', 'eco2'], description: 'Indoor air quality sensor with TVOC and equivalent CO2 outputs. Needs burn-in and humidity compensation.' },
  { id: 'ccs811', name: 'CCS811 TVOC + eCO2', manufacturer: 'ams', address: '0x5a', tags: ['air-quality', 'tvoc', 'eco2'] },
  { id: 'apds9960', name: 'APDS9960 Gesture + Color + Proximity', manufacturer: 'Broadcom', address: '0x39', tags: ['gesture', 'color', 'proximity', 'rgb'] },
  { id: 'veml6075', name: 'VEML6075 UVA/UVB Sensor', manufacturer: 'Vishay', address: '0x10', tags: ['uv', 'light', 'environment'] },
  { id: 'tsl2591', name: 'TSL2591 High Dynamic Range Lux', manufacturer: 'ams', address: '0x29', tags: ['light', 'lux', 'environment'] },
  { id: 'bh1750', name: 'BH1750 Ambient Light Sensor', manufacturer: 'Rohm', address: '0x23 or 0x5c', tags: ['light', 'lux'] },
  { id: 'max44009', name: 'MAX44009 Ambient Light Sensor', manufacturer: 'Analog Devices', address: '0x4a', tags: ['light', 'lux', 'low-power'] },
  { id: 'veml7700', name: 'VEML7700 Ambient Light Sensor', manufacturer: 'Vishay', address: '0x10', tags: ['light', 'lux', 'high-range'] },
  { id: 'vl53l0x', name: 'VL53L0X Time-of-Flight Distance', manufacturer: 'STMicroelectronics', address: '0x29', tags: ['distance', 'tof', 'laser'], description: 'Laser ToF ranging up to about 2 m. Better than ultrasonic for soft or angled targets.' },
  { id: 'vl53l1x', name: 'VL53L1X Long-Range ToF', manufacturer: 'STMicroelectronics', address: '0x29', tags: ['distance', 'tof', 'laser', 'long-range'] },
  { id: 'tof10120', name: 'TOF10120 Laser Distance', manufacturer: 'Generic', address: '0x52', tags: ['distance', 'tof', 'laser'] },
  { id: 'mpu9250', name: 'MPU9250 9-Axis IMU', manufacturer: 'InvenSense', address: '0x68 or 0x69', tags: ['imu', 'accelerometer', 'gyro', 'magnetometer'] },
  { id: 'icm20948', name: 'ICM-20948 9-Axis IMU', manufacturer: 'InvenSense', address: '0x68 or 0x69', tags: ['imu', 'accelerometer', 'gyro', 'magnetometer'] },
  { id: 'bno055', name: 'BNO055 9-Axis Absolute Orientation', manufacturer: 'Bosch', address: '0x28 or 0x29', tags: ['imu', 'orientation', 'fusion'], description: 'IMU with an on-chip sensor fusion engine that outputs quaternions and Euler angles.' },
  { id: 'adxl345', name: 'ADXL345 3-Axis Accelerometer', manufacturer: 'Analog Devices', address: '0x53 or 0x1d', tags: ['accelerometer', 'vibration', 'motion'] },
  { id: 'lis3dh', name: 'LIS3DH 3-Axis Accelerometer', manufacturer: 'STMicroelectronics', address: '0x18 or 0x19', tags: ['accelerometer', 'motion', 'low-power'] },
  { id: 'lsm6ds3', name: 'LSM6DS3 6-Axis IMU', manufacturer: 'STMicroelectronics', address: '0x6a or 0x6b', tags: ['imu', 'accelerometer', 'gyro'] },
  { id: 'mlx90614', name: 'MLX90614 Infrared Thermometer', manufacturer: 'Melexis', address: '0x5a', tags: ['temperature', 'ir', 'non-contact'], industrial: true },
  { id: 'max30102', name: 'MAX30102 Heart Rate + SpO2', manufacturer: 'Maxim', address: '0x57', tags: ['biometric', 'heart-rate', 'spo2'] },
  { id: 'ina219', name: 'INA219 Current + Voltage Monitor', manufacturer: 'Texas Instruments', address: '0x40', tags: ['current', 'voltage', 'power'], description: 'High-side current and bus voltage monitor. Excellent for solar, battery and motor diagnostics.' },
  { id: 'ina226', name: 'INA226 Precision Power Monitor', manufacturer: 'Texas Instruments', address: '0x40', tags: ['current', 'voltage', 'power', 'precision'], industrial: true },
  { id: 'ads1115', name: 'ADS1115 16-Bit ADC', manufacturer: 'Texas Instruments', address: '0x48-0x4b', tags: ['adc', 'analog', 'precision'], description: 'Four-channel 16-bit ADC. Use it to add analog inputs to a Raspberry Pi or to read 0-5 V sensors safely.' },
  { id: 'pcf8591', name: 'PCF8591 8-Bit ADC + DAC', manufacturer: 'NXP', address: '0x48-0x4f', tags: ['adc', 'dac', 'analog'] },
  { id: 'mcp23017', name: 'MCP23017 16-Bit I/O Expander', manufacturer: 'Microchip', address: '0x20-0x27', tags: ['io-expander', 'gpio'] },
  { id: 'pcf8574', name: 'PCF8574 8-Bit I/O Expander', manufacturer: 'NXP', address: '0x20-0x27', tags: ['io-expander', 'gpio', 'lcd'] },
  { id: 'as5600', name: 'AS5600 Magnetic Rotary Encoder', manufacturer: 'ams', address: '0x36', tags: ['encoder', 'angle', 'magnetic'], description: 'Contactless 12-bit magnetic angle sensor for motor position and knobs.' },
  { id: 'tmp117', name: 'TMP117 Precision Temperature', manufacturer: 'Texas Instruments', address: '0x48-0x4b', tags: ['temperature', 'precision'], industrial: true, operatingTempC: [-55, 150] },
  { id: 'lm75', name: 'LM75 Temperature Sensor', manufacturer: 'NXP', address: '0x48-0x4f', tags: ['temperature', 'legacy'] },
]

const i2cComponents: ComponentDefinition[] = i2cSensors.map((sensor) =>
  i2c({
    id: sensor.id,
    name: sensor.name,
    manufacturer: sensor.manufacturer,
    category: 'Sensors',
    address: sensor.address,
    description: sensor.description,
    voltage: sensor.voltage ?? 3.3,
    fiveVoltTolerant: sensor.fiveVoltTolerant ?? false,
    tags: sensor.tags,
    industrial: sensor.industrial,
    operatingTempC: sensor.operatingTempC,
    datasheetUrl: sensor.datasheetUrl,
    safety: sensor.id === 'sgp30' ? ['Allow 12 hours of burn-in and calibrate humidity for accurate TVOC readings.'] : undefined,
  }),
)

const analogSensors: Array<{
  id: string
  name: string
  manufacturer: string
  tags: string[]
  voltage?: number
  outputLabel?: string
  description?: string
  industrial?: boolean
}> = [
  { id: 'mq3', name: 'MQ-3 Alcohol Sensor', manufacturer: 'Winsen', tags: ['gas', 'alcohol', 'analog'], outputLabel: 'AOUT' },
  { id: 'mq4', name: 'MQ-4 Methane Sensor', manufacturer: 'Winsen', tags: ['gas', 'methane', 'analog'], outputLabel: 'AOUT' },
  { id: 'mq5', name: 'MQ-5 LPG Sensor', manufacturer: 'Winsen', tags: ['gas', 'lpg', 'analog'], outputLabel: 'AOUT' },
  { id: 'mq6', name: 'MQ-6 Propane Sensor', manufacturer: 'Winsen', tags: ['gas', 'propane', 'analog'], outputLabel: 'AOUT' },
  { id: 'mq7', name: 'MQ-7 Carbon Monoxide Sensor', manufacturer: 'Winsen', tags: ['gas', 'co', 'analog'], outputLabel: 'AOUT' },
  { id: 'mq8', name: 'MQ-8 Hydrogen Sensor', manufacturer: 'Winsen', tags: ['gas', 'hydrogen', 'analog'], outputLabel: 'AOUT' },
  { id: 'mq9', name: 'MQ-9 Combustible Gas Sensor', manufacturer: 'Winsen', tags: ['gas', 'combustible', 'analog'], outputLabel: 'AOUT' },
  { id: 'mq135', name: 'MQ-135 Air Quality Sensor', manufacturer: 'Winsen', tags: ['gas', 'air-quality', 'analog'], outputLabel: 'AOUT' },
  { id: 'soil-moisture', name: 'Capacitive Soil Moisture Sensor', manufacturer: 'Generic', tags: ['soil', 'moisture', 'agriculture'], outputLabel: 'AOUT' },
  { id: 'water-level', name: 'Water Level Sensor', manufacturer: 'Generic', tags: ['water', 'level', 'analog'], outputLabel: 'S' },
  { id: 'rain-sensor', name: 'Rain Detector', manufacturer: 'Generic', tags: ['rain', 'weather', 'analog'], outputLabel: 'AO' },
  { id: 'ldr', name: 'LDR Light Sensor', manufacturer: 'Generic', tags: ['light', 'ldr', 'analog'], outputLabel: 'AO' },
  { id: 'uv-sensor', name: 'GUVA-S12SD UV Sensor', manufacturer: 'Generic', tags: ['uv', 'light', 'analog'], outputLabel: 'OUT' },
  { id: 'sound-sensor', name: 'Sound Level Sensor', manufacturer: 'Generic', tags: ['sound', 'microphone', 'analog'], outputLabel: 'AO' },
  { id: 'flame-sensor', name: 'Flame Sensor', manufacturer: 'Generic', tags: ['flame', 'fire', 'analog'], outputLabel: 'AO' },
  { id: 'vibration-sensor', name: 'Vibration Sensor', manufacturer: 'Generic', tags: ['vibration', 'condition-monitoring', 'analog'], outputLabel: 'AO', industrial: true },
  { id: 'flex-sensor', name: 'Flex Sensor', manufacturer: 'Spectra Symbol', tags: ['flex', 'wearable', 'analog'], outputLabel: 'OUT' },
  { id: 'fsr', name: 'Force Sensitive Resistor', manufacturer: 'Interlink', tags: ['force', 'touch', 'analog'], outputLabel: 'OUT' },
  { id: 'acs712-05', name: 'ACS712 5 A Current Sensor', manufacturer: 'Allegro', tags: ['current', 'analog', 'ac-dc'], outputLabel: 'OUT' },
  { id: 'acs712-20', name: 'ACS712 20 A Current Sensor', manufacturer: 'Allegro', tags: ['current', 'analog', 'ac-dc'], outputLabel: 'OUT' },
  { id: 'acs712-30', name: 'ACS712 30 A Current Sensor', manufacturer: 'Allegro', tags: ['current', 'analog', 'ac-dc'], outputLabel: 'OUT' },
  { id: 'voltage-divider', name: 'Voltage Divider Module', manufacturer: 'Generic', tags: ['voltage', 'analog', 'measurement'], outputLabel: 'OUT' },
  { id: 'ph-sensor', name: 'pH Sensor Module', manufacturer: 'Generic', tags: ['ph', 'water', 'analog'], outputLabel: 'PO' },
  { id: 'ec-sensor', name: 'EC / Conductivity Sensor', manufacturer: 'Generic', tags: ['ec', 'water', 'analog'], outputLabel: 'AOUT' },
  { id: 'turbidity-sensor', name: 'Turbidity Sensor', manufacturer: 'Generic', tags: ['turbidity', 'water', 'analog'], outputLabel: 'AOUT' },
  { id: 'do-sensor', name: 'Dissolved Oxygen Sensor', manufacturer: 'Generic', tags: ['oxygen', 'water', 'analog'], outputLabel: 'AOUT' },
  { id: 'anemometer', name: 'Anemometer (Analog)', manufacturer: 'Generic', tags: ['wind', 'weather', 'analog'], outputLabel: 'OUT' },
  { id: 'wind-vane', name: 'Wind Vane', manufacturer: 'Generic', tags: ['wind', 'weather', 'analog'], outputLabel: 'OUT' },
]

const analogComponents: ComponentDefinition[] = analogSensors.map((sensor) =>
  analog({
    id: sensor.id,
    name: sensor.name,
    manufacturer: sensor.manufacturer,
    category: 'Sensors',
    description: sensor.description,
    outputLabel: sensor.outputLabel,
    voltage: sensor.voltage ?? 5,
    tags: [...sensor.tags, 'analog'],
    industrial: sensor.industrial,
    safety: [
      'Most analog modules output 0-5 V even when powered from 3.3 V logic. Divide the output before a 3.3 V ADC.',
    ],
  }),
)

const digitalSensors: Array<{
  id: string
  name: string
  manufacturer: string
  tags: string[]
  input?: boolean
  voltage?: number
  industrial?: boolean
  description?: string
}> = [
  { id: 'dht11', name: 'DHT11 Temperature + Humidity', manufacturer: 'Aosong', tags: ['temperature', 'humidity', '1-wire'], input: true, description: 'Low-cost digital temperature and humidity sensor. Less accurate but very cheap.' },
  { id: 'ds18b20', name: 'DS18B20 Waterproof Temperature Probe', manufacturer: 'Maxim', tags: ['temperature', '1-wire', 'waterproof'], input: true },
  { id: 'hc-sr501', name: 'HC-SR501 PIR Motion Sensor', manufacturer: 'Generic', tags: ['motion', 'pir', 'security'], input: true, industrial: true },
  { id: 'rcwl-0516', name: 'RCWL-0516 Microwave Radar Motion', manufacturer: 'Generic', tags: ['motion', 'radar', 'security'], input: true },
  { id: 'yf-s201', name: 'YF-S201 Water Flow Sensor', manufacturer: 'Generic', tags: ['flow', 'water', 'pulse'], input: true },
  { id: 'yf-dn40', name: 'YF-DN40 Large Flow Sensor', manufacturer: 'Generic', tags: ['flow', 'water', 'pulse'], input: true, industrial: true },
  { id: 'reed-switch', name: 'Reed Switch', manufacturer: 'Generic', tags: ['reed', 'magnetic', 'door'], input: true },
  { id: 'a3144-hall', name: 'A3144 Hall Effect Sensor', manufacturer: 'Allegro', tags: ['hall', 'magnetic', 'speed'], input: true },
  { id: 'limit-switch', name: 'Mechanical Limit Switch', manufacturer: 'Generic', tags: ['limit', 'endstop', 'safety'], input: true, industrial: true },
  { id: 'tilt-switch', name: 'Tilt / Ball Switch', manufacturer: 'Generic', tags: ['tilt', 'orientation'], input: true },
  { id: 'shock-switch', name: 'Shock / Knock Sensor', manufacturer: 'Generic', tags: ['shock', 'vibration'], input: true },
  { id: 'laser-trip', name: 'Laser Trip Sensor', manufacturer: 'Generic', tags: ['laser', 'trip', 'security'], input: true },
  { id: 'hx711', name: 'HX711 Load Cell Amplifier', manufacturer: 'Avia Semiconductor', tags: ['load-cell', 'weight', 'scale'], input: true, description: '24-bit load-cell amplifier with a simple two-wire data interface. Very common in scales.' },
  { id: 'pir-industrial', name: 'Industrial PIR Motion Detector', manufacturer: 'Generic', tags: ['motion', 'pir', 'industrial'], input: true, industrial: true, voltage: 24 },
]

const digitalComponents: ComponentDefinition[] = digitalSensors.map((sensor) =>
  digital({
    id: sensor.id,
    name: sensor.name,
    manufacturer: sensor.manufacturer,
    category: 'Sensors',
    description: sensor.description,
    input: sensor.input ?? true,
    voltage: sensor.voltage ?? 5,
    tags: sensor.tags,
    industrial: sensor.industrial,
    safety: sensor.id === 'ds18b20' ? ['Add a 4.7 kΩ pull-up from DATA to VCC; long cables need a lower pull-up and a twisted pair.'] : undefined,
  }),
)

const spiSensors: ComponentDefinition[] = [
  spi({
    id: 'max6675',
    name: 'MAX6675 K-Type Thermocouple', manufacturer: 'Maxim', category: 'Sensors', voltage: 5, fiveVoltTolerant: true,
    tags: ['temperature', 'thermocouple', 'high-temp'], noMiso: false,
    interfaces: ['SPI'],
    description: 'K-type thermocouple interface for temperatures up to about 1024 °C. Common on reflow ovens and kilns.',
    industrial: true,
  }),
  spi({
    id: 'max31855',
    name: 'MAX31855 K-Type Thermocouple', manufacturer: 'Maxim', category: 'Sensors', voltage: 3.3,
    tags: ['temperature', 'thermocouple', 'high-temp'], interfaces: ['SPI'], industrial: true,
  }),
  spi({
    id: 'max31865',
    name: 'MAX31865 PT100/PT1000 RTD', manufacturer: 'Maxim', category: 'Sensors', voltage: 3.3,
    tags: ['temperature', 'rtd', 'pt100', 'precision'], interfaces: ['SPI'], industrial: true,
    description: 'Precision RTD interface for PT100/PT1000 probes. Set the reference resistor for the fitted probe.',
  }),
  spi({
    id: 'mcp3008',
    name: 'MCP3008 8-Channel 10-Bit ADC', manufacturer: 'Microchip', category: 'Sensors', voltage: 3.3,
    tags: ['adc', 'analog', 'raspberry-pi'], interfaces: ['SPI'], noMiso: false,
    description: 'Low-cost 8-channel ADC for adding analog inputs to a Raspberry Pi.',
  }),
  spi({
    id: 'ads1256',
    name: 'ADS1256 8-Channel 24-Bit ADC', manufacturer: 'Texas Instruments', category: 'Sensors', voltage: 5,
    tags: ['adc', 'precision', 'daq'], interfaces: ['SPI'], industrial: true,
    description: 'High-resolution 24-bit ADC for strain gauges, thermocouples and precision instrumentation.',
  }),
  spi({
    id: 'as5048a',
    name: 'AS5048A Magnetic Encoder', manufacturer: 'ams', category: 'Sensors', voltage: 3.3,
    tags: ['encoder', 'magnetic', 'motor'], interfaces: ['SPI'], industrial: true,
  }),
]

const uartSensors: ComponentDefinition[] = [
  uart({
    id: 'pms5003',
    name: 'PMS5003 Particulate Matter Sensor', manufacturer: 'Plantower', category: 'Sensors', voltage: 5,
    tags: ['pm2.5', 'pm10', 'air-quality'], interfaces: ['UART'],
    description: 'Laser particle counter for PM1.0/PM2.5/PM10. The fan draws a short current pulse at start-up.',
  }),
  uart({
    id: 'mh-z19b',
    name: 'MH-Z19B CO2 Sensor', manufacturer: 'Winsen', category: 'Sensors', voltage: 5,
    tags: ['co2', 'air-quality', 'ndir'], interfaces: ['UART'],
    description: 'NDIR CO2 sensor with UART and PWM outputs. Needs a 5 V supply and a calibration baseline.',
  }),
  uart({
    id: 'scd30',
    name: 'SCD30 CO2 + Temperature + Humidity', manufacturer: 'Sensirion', category: 'Sensors', voltage: 3.3,
    tags: ['co2', 'temperature', 'humidity', 'ndir'], interfaces: ['I2C', 'UART'], industrial: true,
  }),
  uart({
    id: 'ld19-lidar',
    name: 'LD19 2D LiDAR', manufacturer: 'LDROBOT', category: 'Sensors', voltage: 5,
    tags: ['lidar', 'distance', 'slam', 'robotics'], interfaces: ['UART'], industrial: true,
    description: '360° 2D LiDAR for robot navigation. Uses a 230400 baud UART stream and a 5 V supply.',
  }),
  uart({
    id: 'tfmini-s',
    name: 'TFmini-S LiDAR Range Sensor', manufacturer: 'Benewake', category: 'Sensors', voltage: 5,
    tags: ['lidar', 'distance', 'robotics'], interfaces: ['UART', 'I2C'], industrial: true,
  }),
  uart({
    id: 'a02yyuw',
    name: 'A02YYUW Waterproof Ultrasonic', manufacturer: 'DFRobot', category: 'Sensors', voltage: 5,
    tags: ['ultrasonic', 'distance', 'waterproof', 'level'], interfaces: ['UART'], industrial: true,
  }),
]

export const sensorComponents: ComponentDefinition[] = [
  ...i2cComponents,
  ...analogComponents,
  ...digitalComponents,
  ...spiSensors,
  ...uartSensors,
  makeComponent({
    id: 'bme688',
    name: 'BME688 AI Air Quality Sensor',
    manufacturer: 'Bosch',
    category: 'Sensors',
    description: 'Gas, pressure, temperature and humidity sensor with an AI-capable gas scanner.',
    voltage: 3.3,
    interfaces: ['I2C', 'SPI'],
    pins: [
      { id: 'vcc', label: 'VCC', role: 'power', direction: 'in' },
      { id: 'gnd', label: 'GND', role: 'ground', direction: 'in' },
      { id: 'sda', label: 'SDA', role: 'i2c-sda', direction: 'bidir' },
      { id: 'scl', label: 'SCL', role: 'i2c-scl', direction: 'in' },
    ],
    i2cAddress: '0x76 or 0x77',
    tags: ['air-quality', 'gas', 'pressure', 'temperature', 'humidity', 'ai'],
    industrial: true,
  }),
]
