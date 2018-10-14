/**
 * Device.ts
 * 
 * @author    Desionlab <fenixphp@gmail.com>
 * @copyright 2018 Desionlab
 * @license   MIT
 */

import SerialPort from 'serialport';
import * as CCNet from './Const/CCNet';
import { Command } from './Command';
import * as Commands from './Commands';
import { Task } from './Task';
import { Parser } from './Parser';
import { EventEmitter } from 'events';
import { Exception } from './Exception';
import { getCRC16 } from './Utils';

/**
 * Indicates state of the Bill Validator and its activity.
 */
export const enum DeviceStatus {
  POWER_UP                                                   = '10',
  POWER_UP_WITH_BILL_IN_VALIDATOR                            = '11',
  POWER_UP_WITH_BILL_IN_STACKER                              = '12',
  /* ----------------------------------------------------------------------- */
  INITIALIZE                                                 = '13',
  IDLING                                                     = '14',
  ACCEPTING                                                  = '15',
  STACKING                                                   = '17',
  RETURNING                                                  = '18',
  UNIT_DISABLED                                              = '19',
  HOLDING                                                    = '1a',
  DEVICE_BUSY                                                = '1b',
  /* ----------------------------------------------------------------------- */
  REJECTING_DUE_TO_INSERTION                                 = '1c60',
  REJECTING_DUE_TO_MAGNETIC                                  = '1c61',
  REJECTING_DUE_TO_REMAINED_BILL_IN_HEAD                     = '1c62',
  REJECTING_DUE_TO_MULTIPLYING                               = '1c63',
  REJECTING_DUE_TO_CONVEYING                                 = '1c64',
  REJECTING_DUE_TO_IDENTIFICATION                            = '1c65',
  REJECTING_DUE_TO_VERIFICATION                              = '1c66',
  REJECTING_DUE_TO_OPTIC                                     = '1c67',
  REJECTING_DUE_TO_INHIBIT                                   = '1c68',
  REJECTING_DUE_TO_CAPACITY                                  = '1c69',
  REJECTING_DUE_TO_OPERATION                                 = '1c6a',
  REJECTING_DUE_TO_LENGTH                                    = '1c6c',
  REJECTING_DUE_TO_UNRECOGNISED_BARCODE                      = '1c92',
  REJECTING_DUE_TO_UV                                        = '1c6d',
  REJECTING_DUE_TO_INCORRECT_NUMBER_OF_CHARACTERS_IN_BARCODE = '1c93',
  REJECTING_DUE_TO_UNKNOWN_BARCODE_START_SEQUENCE            = '1c94',
  REJECTING_DUE_TO_UNKNOWN_BARCODE_STOP_SEQUENCE             = '1c95',
  /* ----------------------------------------------------------------------- */
  DROP_CASSETTE_FULL                                         = '41',
  DROP_CASSETTE_OUT_OF_POSITION                              = '42',
  VALIDATOR_JAMMED                                           = '43',
  DROP_CASSETTE_JAMMED                                       = '44',
  CHEATED                                                    = '45',
  PAUSE                                                      = '46',
  /* ----------------------------------------------------------------------- */
  STACK_MOTOR_FAILURE                                        = '4750',
  TRANSPORT_MOTOR_SPEED_FAILURE                              = '4751',
  TRANSPORT_MOTOR_FAILURE                                    = '4752',
  ALIGNING_MOTOR_FAILURE                                     = '4753',
  INITIAL_CASSETTE_STATUS_FAILURE                            = '4754',
  OPTIC_CANAL_FAILURE                                        = '4755',
  MAGNETIC_CANAL_FAILURE                                     = '4756',
  CAPACITANCE_CANAL_FAILURE                                  = '475f',
  /* ----------------------------------------------------------------------- */
  ESCROW_POSITION                                            = '80',
  BILL_STACKED                                               = '81',
  BILL_RETURNED                                              = '82'
};

/**
 * 
 */
export const enum DeviceStatusMessage {};

/**
 * Class Device
 * 
 * The object implements the main methods and events for working 
 * with the "CashCode" bill acceptor using the "CCNet" protocol.
 * 
 * @version 1.0.0
 */
export class Device extends EventEmitter {

  /**
   * Serialport address.
   */
  protected port: string = '';

  /**
   * Serialport options.
   */
  protected options: SerialPort.OpenOptions = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    autoOpen: false
  };
  
  /**
   * The logger. You can pass electron-log, winston or another logger
   * with the following interface: { info(), debug(), warn(), error() }.
   * Set it to null if you would like to disable a logging feature.
   */
  protected logger: any = null;

  /* ----------------------------------------------------------------------- */
  
  /**
   * Serialport transport instant.
   */
  protected serial: SerialPort = null;

  /**
   * CCNet packet parser instant.
   */
  protected parser: Parser = null;
  
  /* ----------------------------------------------------------------------- */
  
  /**
   * Main status code.
   */
  protected status: number = null;

  /**
   * A flag indicating the current command execution.
   */
  protected busy: boolean = false;

  /* ----------------------------------------------------------------------- */
  
  /**
   * List of pending commands.
   */
  protected queue: Array<Task> = [];

  /**
   * 
   */
  protected timerMs: number = 100;

  /**
   * Operating timer.
   */
  protected timerInterval: NodeJS.Timer = null;

  /* ----------------------------------------------------------------------- */
  
  /**
   * Device constructor.
   * 
   * @param port Serial port address.
   * @param options Serial port open options.
   * @param logger Logger instant.
   */
  public constructor (port: string, options?: SerialPort.OpenOptions, logger?: any) {
    super();
    
    /* --------------------------------------------------------------------- */

    /* Set serialport address. */
    this.port = port;
    
    /* Set serialport options. */
    if (options) {
      this.options = Object.assign(this.options, options);
    }

    /* Set logger instant. */
    if (logger) {
      this.logger = logger;
    }
    
    /* --------------------------------------------------------------------- */

    /* Bind operating timer event. */
    this.on('tick', () => {
      setImmediate(() => {
        this.onTick();
      });
    });

    /* --------------------------------------------------------------------- */

    /* Create serialport transport. */
    this.serial = new SerialPort(this.port, this.options, null);
    
    /* Bind serial open event. */
    this.serial.on('open', () => { this.onSerialPortOpen(); });

    /* Bind serial error event. */
    this.serial.on('error', (error) => { this.onSerialPortError(error); });

    /* Bind serial close event. */
    this.serial.on('close', () => { this.onSerialPortClose(); });

    /* Set CCNet packet parser. */
    this.parser = this.serial.pipe(new Parser());
    
    /* --------------------------------------------------------------------- */

  }

  /* ----------------------------------------------------------------------- */
  
  /**
   * Flag of the established connection to the device.
   */
  get isConnect () {
    return (this.serial.isOpen);
  }
  
  /**
   * A flag indicating the current command execution.
   */
  get isBusy () {
    return this.busy;
  }

  /* ----------------------------------------------------------------------- */
  
  /**
   * Connect to device.
   */
  public async connect () : Promise<any> {
    try {
      /*  */
      await this.open();

      /*  */
      await this.reset();

      /*  */
      //await this.asyncOnce('initialize');

      /*  */
      await this.execute((new Commands.Identification()));

      /*  */
      await this.execute((new Commands.GetBillTable()));

      /*  */
      await this.execute((new Commands.GetCRC32OfTheCode()));

      /*  */
      this.emit('connect');
      
      /*  */
      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Disconnect from device.
   */
  public async disconnect () : Promise<any> {
    try {
      await this.close(); 
    } catch (error) {
      throw error;
    }
  }

  /**
   * Reset the device to its original state.
   */
  public async reset () : Promise<any> {
    return await this.execute((new Commands.Reset()));
  }

  /**
   * 
   */
  public async getInfo () : Promise<any> {}

  /**
   * 
   */
  public async getBillTable () : Promise<any> {}

  /**
   * 
   */
  public async beginEscrow () : Promise<any> {}

  /**
   * 
   */
  public async billHold () : Promise<any> {}

  /**
   * 
   */
  public async billStack () : Promise<any> {}

  /**
   * 
   */
  public async billReturn () : Promise<any> {}

  /**
   * 
   */
  public async endEscrow () : Promise<any> {}

  /* ----------------------------------------------------------------------- */

  /**
   * Open serialport.
   */
  protected open () : Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.serial.isOpen) {
        resolve(true);
      } else {
        this.serial.open((error) => {
          if (error) {
            reject(error);
          }
  
          resolve(true);
        });
      }
    });
  }
  
  /**
   * Close serialport.
   */
  protected close () : Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.serial.isOpen) {
        this.serial.close((error) => {
          if (error) {
            reject(error);
          }
  
          resolve(true);
        });
      } else {
        resolve(true);
      }
    });
  }

  /* ----------------------------------------------------------------------- */
  
  /**
   * On serial open event.
   */
  protected onSerialPortOpen () {
    /* Start operating timer. */
    this.timerInterval = setInterval(() => {
      this.emit('tick');
    }, this.timerMs);
  }

  /**
   * On serial error event.
   * 
   * @param error Serialport error object.
   */
  protected onSerialPortError (error: Error) {
    /* Stop operating timer. */
    clearInterval(this.timerInterval);
  }

  /**
   * On serial close event.
   */
  protected onSerialPortClose () {
    /* Stop operating timer. */
    clearInterval(this.timerInterval);
  }
  
  /**
   * All status events handler.
   * 
   * @param status Current devise status.
   */
  protected onStatus (status: Buffer) {}

  /**
   * Operating timer event.
   */
  protected onTick () {
    /* Check busy flag. */
    if (!this.busy) {
      let task = this.queue.shift();

      /* Check next task. */
      if (typeof task !== 'undefined' && task instanceof Task) {
        /* Update flag. */
        this.busy = true;

        let timeoutCounter: number = 0;

        /* Timeout timer handler. */
        let timeoutHandler = () => {
          setImmediate(() => {
            timeoutCounter += this.timerMs;

            if (timeoutCounter >= task.timeout) {
              this.busy = false;
              this.removeListener('tick', timeoutHandler);
              task.done(new Exception(10, 'Request timeout.'), null);
            }
          });
        };

        /* Receive packet handler. */
        let handler = async (response: Buffer) => {
          this.removeListener('tick', timeoutHandler);
            
          /* Unbind event. */
          this.parser.removeListener('data', handler);
          
          /* Write debug info. */
          if (this.logger) {
            this.logger.debug('Receive packet:', response);
          }

          /* Check CRC */
          let ln = response.length;
          let check = response.slice(ln-2, ln);
          let slice = response.slice(0, ln-2);

          /* Check response CRC. */
          if (check.toString() !== (getCRC16(slice)).toString()) {
            /* Send NAK. */
            await this.serial.write((new Commands.Nak()).request());

            /* Update flag. */
            this.busy = false;

            /* Send event. */
            task.done(new Exception(11, 'Wrong response data hash.'), null);
          }

          /* Get data from packet. */
          let data = response.slice(3, ln-2);
          
          /* Check response type. */
          if (data.length == 1 && data[0] == 0x00) {
            /* Response receive as ACK. */
          } else if (data.length == 1 && data[0] == 0xFF) {
            /* Response receive as NAK. */
            
            /* Update flag. */
            this.busy = false;
            
            /* Send event. */
            task.done(new Exception(11, 'Wrong request data hash.'), null);
          } else {
            /* Send ACK. */
            await this.serial.write((new Commands.Ack()).request());
          }
          
          /* Update flag. */
          this.busy = false;

          /* Send event. */
          task.done(null, data);
        };

        /* Bind event. */
        this.parser.once('data', handler);

        /* Write debug info. */
        if (this.logger) {
          this.logger.debug('Send packet:', task.data);
        }

        /* Send packet. */
        this.serial.write(task.data);

        /* Bind timeout handler. */
        if (task.timeout) {
          this.on('tick', timeoutHandler);
        }
      } else {
        /* Add poll task to queue. */
        this.queue.push(new Task((new Commands.Poll()).request(), (error, data) => {
          if (error) {
            throw error;
          }
  
          this.onStatus(data);
        }, 1000));
      }
    }
  }

  /* ----------------------------------------------------------------------- */
  
  /**
   * Execute the specified command.
   * 
   * @param command Target command.
   * @param params Execute parameters.
   * @param timeout The maximum time to complete this action.
   */
  public async execute (command: Command, params: any = [], timeout: number = 1000) : Promise<any> {
    return new Promise((resolve, reject) => {
      let task = new Task(command.request(params), (error, data) => {
        if (error) {
          reject(error);
        }

        resolve(command.response(data));
      }, timeout);

      this.queue.push(task);
    });
  }

  /**
   * Synchronization of internal events with the execution queue.
   * 
   * @param event Internal event name.
   * @param timeout Maximum waiting time for an internal event.
   */
  public async asyncOnce (event: string | symbol, timeout: number = 1000) : Promise<any> {
    return new Promise((resolve, reject) => {
      let timeoutCounter: number = 0;

      let timeoutHandler = () => {
        setImmediate(() => {
          timeoutCounter += this.timerMs;

          if (timeoutCounter >= timeout) {
            this.removeListener('tick', timeoutHandler);
            reject();
          }
        });
      };

      this.once(event, () => {
        if (timeout) {
          this.removeListener('tick', timeoutHandler);
        }

        resolve();
      });

      if (timeout) {
        this.on('tick', timeoutHandler);
      }
    });
  }

}

/* End of file Device.ts */